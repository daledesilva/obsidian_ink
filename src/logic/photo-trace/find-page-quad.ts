//////////
//////////

export interface PagePoint {
	x: number;
	y: number;
}

export interface PageQuad {
	/** Top-left, top-right, bottom-right, bottom-left in source pixels. */
	corners: [PagePoint, PagePoint, PagePoint, PagePoint];
}

const DETECT_MAX_EDGE = 360;
const MIN_AREA_RATIO = 0.2;
const MAX_AREA_RATIO = 0.94;

/**
 * Image corners in source pixels. Used when no page border is visible.
 */
export function fullFrameCorners(width: number, height: number): [PagePoint, PagePoint, PagePoint, PagePoint] {
	return [
		{ x: 0, y: 0 },
		{ x: width, y: 0 },
		{ x: width, y: height },
		{ x: 0, y: height },
	];
}

/**
 * True when the quad is the photo itself, so a tight crop must not be inset further.
 */
export function quadMatchesFullFrame(
	corners: [PagePoint, PagePoint, PagePoint, PagePoint],
	width: number,
	height: number,
): boolean {
	const frame = fullFrameCorners(width, height);
	// Only skip a warp when the pins are truly the photo corners. A 4% window
	// treated an inset page as the full frame, so the tracer kept the hand and desk.
	const toleranceX = Math.max(8, width * 0.008);
	const toleranceY = Math.max(8, height * 0.008);
	for (let i = 0; i < 4; i++) {
		const deltaX = Math.abs(corners[i].x - frame[i].x);
		const deltaY = Math.abs(corners[i].y - frame[i].y);
		if (deltaX > toleranceX || deltaY > toleranceY) return false;
	}
	return true;
}

/**
 * Finds a page quadrilateral using centre-seeded paper colour/luminance segmentation,
 * or smoothness when the page and background share a colour. Candidates are scored by
 * interior paper uniformity, boundary edge contrast, and corner geometry. Returns null
 * when the photo is already the page or no trustworthy border exists.
 */
export function findPageQuad(
	gray: Uint8Array,
	width: number,
	height: number,
	rgba?: Uint8ClampedArray,
): PageQuad | null {
	if (width < 8 || height < 8) return null;
	const longEdge = Math.max(width, height);
	const scale = longEdge > DETECT_MAX_EDGE ? DETECT_MAX_EDGE / longEdge : 1;
	const detectWidth = Math.max(8, Math.round(width * scale));
	const detectHeight = Math.max(8, Math.round(height * scale));
	const smallGray = downscaleGray(gray, width, height, detectWidth, detectHeight);
	const smallRgb = rgba && rgba.length >= width * height * 4
		? downscaleRgb(rgba, width, height, detectWidth, detectHeight)
		: null;
	const blurred = boxBlur(smallGray, detectWidth, detectHeight);
	const edges = sobelEdges(blurred, detectWidth, detectHeight);
	const smoothLikelihood = smoothPaperLikelihood(smallGray, detectWidth, detectHeight);
	let paperLikelihood: Float32Array;
	let maskCloseRadius = 3;
	if (smoothLikelihood) {
		// White paper and gray carpet share a colour, so chromaticity cannot separate
		// them, and a shadow closes the brightness gap as well. Flattening the lighting
		// leaves the page smooth and the carpet textured, which still marks the sheet.
		paperLikelihood = smoothLikelihood;
		// Ruled lines and the shadow edge are thin dark gaps. A slightly wider close
		// bridges them without reaching the carpet margin.
		maskCloseRadius = 5;
	} else {
		paperLikelihood = buildCenterPaperLikelihoodMask(
			blurred,
			smallRgb,
			detectWidth,
			detectHeight,
		);
	}

	const candidates: [PagePoint, PagePoint, PagePoint, PagePoint][] = [];

	// 1. Centre-seeded paper component candidates (bridges across ink strokes and torn notches,
	// then opens by radius 2 to sever thin bridges into background notes).
	for (const strictness of [1.1, 1.3, 1.5, 0.9]) {
		const rawMask = thresholdPaperMask(paperLikelihood, strictness);
		const closedMask = closeBinaryMask(rawMask, detectWidth, detectHeight, maskCloseRadius);
		const openedMask = erodeBinaryMask(closedMask, detectWidth, detectHeight, 2);
		const centralCore = extractDominantCentralComponent(openedMask, detectWidth, detectHeight);
		if (!centralCore) continue;
		const centralComponent = dilateBinaryMask(centralCore, detectWidth, detectHeight, 2);
		const boundary = extractMaskBoundaryPoints(centralComponent, detectWidth, detectHeight);
		if (boundary.length < 24) continue;
		for (const fitted of fitCandidateQuadsFromRegion(centralComponent, boundary, detectWidth, detectHeight)) {
			candidates.push(fitted);
		}
	}

	// 2. Multi-threshold Sobel edge contour candidates (fallback when paper colour matches desk).
	if (candidates.length === 0) {
		for (const quantile of [0.85, 0.9]) {
			const binary = thresholdEdges(edges, quantile);
			const contours = traceContours(binary, detectWidth, detectHeight);
			for (const contour of contours) {
				if (contour.length < 24) continue;
				const hull = convexHull(contour);
				for (const fitted of fitCandidateQuadsFromHull(hull)) {
					candidates.push(fitted);
				}
			}
		}
	}

	const frameArea = detectWidth * detectHeight;
	let bestQuad: [PagePoint, PagePoint, PagePoint, PagePoint] | null = null;
	let bestScore = -Infinity;

	for (const quad of candidates) {
		const area = polygonArea(quad);
		const areaRatio = area / frameArea;
		if (areaRatio < MIN_AREA_RATIO || areaRatio > MAX_AREA_RATIO) continue;
		if (!quadSidesAreSubstantial(quad, detectWidth, detectHeight)) continue;
		if (!quadGeometryIsPlausible(quad)) continue;

		const score = scoreCandidateQuad(
			quad,
			paperLikelihood,
			edges,
			detectWidth,
			detectHeight,
		);
		if (score > bestScore) {
			bestScore = score;
			bestQuad = quad;
		}
	}

	if (!bestQuad || bestScore < 0.28) return null;

	const scaleX = width / detectWidth;
	const scaleY = height / detectHeight;
	const scaled = bestQuad.map((point) => ({
		x: clamp(point.x * scaleX, 0, width),
		y: clamp(point.y * scaleY, 0, height),
	})) as [PagePoint, PagePoint, PagePoint, PagePoint];
	const corners = orderQuadCorners(scaled);
	if (!cornersAreDistinct(corners)) return null;
	if (quadMatchesFullFrame(corners, width, height)) return null;
	return { corners };
}

function downscaleGray(
	gray: Uint8Array,
	width: number,
	height: number,
	detectWidth: number,
	detectHeight: number,
): Uint8Array {
	const out = new Uint8Array(detectWidth * detectHeight);
	for (let y = 0; y < detectHeight; y++) {
		const y0 = Math.floor((y * height) / detectHeight);
		const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / detectHeight));
		for (let x = 0; x < detectWidth; x++) {
			const x0 = Math.floor((x * width) / detectWidth);
			const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / detectWidth));
			let sum = 0;
			let count = 0;
			for (let yy = y0; yy < y1 && yy < height; yy++) {
				for (let xx = x0; xx < x1 && xx < width; xx++) {
					sum += gray[yy * width + xx];
					count++;
				}
			}
			out[y * detectWidth + x] = count > 0 ? Math.round(sum / count) : 0;
		}
	}
	return out;
}

function downscaleRgb(
	rgba: Uint8ClampedArray,
	width: number,
	height: number,
	detectWidth: number,
	detectHeight: number,
): Uint8Array {
	const out = new Uint8Array(detectWidth * detectHeight * 3);
	for (let y = 0; y < detectHeight; y++) {
		const y0 = Math.floor((y * height) / detectHeight);
		const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / detectHeight));
		for (let x = 0; x < detectWidth; x++) {
			const x0 = Math.floor((x * width) / detectWidth);
			const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / detectWidth));
			let sumR = 0;
			let sumG = 0;
			let sumB = 0;
			let count = 0;
			for (let yy = y0; yy < y1 && yy < height; yy++) {
				for (let xx = x0; xx < x1 && xx < width; xx++) {
					const offset = (yy * width + xx) * 4;
					sumR += rgba[offset];
					sumG += rgba[offset + 1];
					sumB += rgba[offset + 2];
					count++;
				}
			}
			const destOffset = (y * detectWidth + x) * 3;
			if (count > 0) {
				out[destOffset] = Math.round(sumR / count);
				out[destOffset + 1] = Math.round(sumG / count);
				out[destOffset + 2] = Math.round(sumB / count);
			}
		}
	}
	return out;
}

/**
 * Paper likelihood from smoothness after a wide blur removes the shadow.
 * Returns null when the border is not clearly more textured than the page,
 * so coloured paper and a soft background keep the chromaticity mask.
 */
function smoothPaperLikelihood(
	gray: Uint8Array,
	width: number,
	height: number,
): Float32Array | null {
	const illuminationRadius = Math.max(8, Math.round(Math.min(width, height) / 14));
	const texture = illuminationNormalizedTexture(gray, width, height, illuminationRadius);
	const centerLow = texturePercentile(texture, width, height, 0.3, 0.7, 0.3, 0.7, 0.2);
	const borderLow = borderTexturePercentile(texture, width, height, 0.2);
	const textureGap = borderLow - centerLow;
	// Carpet texture sits well above smooth paper (about 3×, and a gap above 0.06).
	// A soft wall or a coloured sheet fails this and stays on colour.
	const backgroundIsTextured = borderLow > centerLow * 3 && textureGap > 0.06;
	if (!backgroundIsTextured) return null;

	const likelihood = new Float32Array(width * height);
	for (let index = 0; index < texture.length; index++) {
		const distance = (texture[index] - centerLow) / textureGap;
		likelihood[index] = clamp(1 - distance, 0, 1);
	}
	return likelihood;
}

/**
 * Local brightness wobble after dividing out a wide blur, so a shadow reads as smooth paper.
 */
function illuminationNormalizedTexture(
	gray: Uint8Array,
	width: number,
	height: number,
	illuminationRadius: number,
): Float32Array {
	const blurred = boxBlurFloat(gray, width, height, illuminationRadius);
	const ratio = new Float32Array(width * height);
	for (let index = 0; index < gray.length; index++) {
		ratio[index] = gray[index] / Math.max(8, blurred[index]);
	}
	const texture = new Float32Array(width * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let sum = 0;
			let sumSq = 0;
			let count = 0;
			for (let dy = -2; dy <= 2; dy++) {
				const sampleY = y + dy;
				if (sampleY < 0 || sampleY >= height) continue;
				for (let dx = -2; dx <= 2; dx++) {
					const sampleX = x + dx;
					if (sampleX < 0 || sampleX >= width) continue;
					const value = ratio[sampleY * width + sampleX];
					sum += value;
					sumSq += value * value;
					count++;
				}
			}
			const mean = sum / count;
			texture[y * width + x] = Math.sqrt(Math.max(0, sumSq / count - mean * mean));
		}
	}
	return texture;
}

/** Separable box blur. The wide radius is the lighting scale, not an edge finder. */
function boxBlurFloat(
	gray: Uint8Array,
	width: number,
	height: number,
	radius: number,
): Float32Array {
	const horizontal = new Float32Array(width * height);
	const blurred = new Float32Array(width * height);
	for (let y = 0; y < height; y++) {
		let sum = 0;
		let count = 0;
		const row = y * width;
		for (let x = -radius; x < width; x++) {
			const addX = x + radius;
			if (addX < width) {
				sum += gray[row + addX];
				count++;
			}
			const removeX = x - radius - 1;
			if (removeX >= 0) {
				sum -= gray[row + removeX];
				count--;
			}
			if (x >= 0) horizontal[row + x] = sum / count;
		}
	}
	for (let x = 0; x < width; x++) {
		let sum = 0;
		let count = 0;
		for (let y = -radius; y < height; y++) {
			const addY = y + radius;
			if (addY < height) {
				sum += horizontal[addY * width + x];
				count++;
			}
			const removeY = y - radius - 1;
			if (removeY >= 0) {
				sum -= horizontal[removeY * width + x];
				count--;
			}
			if (y >= 0) blurred[y * width + x] = sum / count;
		}
	}
	return blurred;
}

/** Low-end texture inside a central window. Ink and rules sit in the high end and are ignored. */
function texturePercentile(
	texture: Float32Array,
	width: number,
	height: number,
	x0Fraction: number,
	x1Fraction: number,
	y0Fraction: number,
	y1Fraction: number,
	quantile: number,
): number {
	const samples: number[] = [];
	const x0 = Math.floor(width * x0Fraction);
	const x1 = Math.ceil(width * x1Fraction);
	const y0 = Math.floor(height * y0Fraction);
	const y1 = Math.ceil(height * y1Fraction);
	for (let y = y0; y < y1; y += 2) {
		for (let x = x0; x < x1; x += 2) samples.push(texture[y * width + x]);
	}
	samples.sort((a, b) => a - b);
	return samples[Math.floor(samples.length * quantile)] ?? 0;
}

/**
 * Low-end texture in a ring inset from the photo edge.
 * The inset skips the flat black rim, which would look as smooth as paper.
 */
function borderTexturePercentile(
	texture: Float32Array,
	width: number,
	height: number,
	quantile: number,
): number {
	const samples: number[] = [];
	const shortEdge = Math.min(width, height);
	const outer = Math.max(2, Math.floor(shortEdge * 0.03));
	const inner = Math.max(outer + 2, Math.floor(shortEdge * 0.09));
	for (let y = outer; y < height - outer; y += 2) {
		const row = y * width;
		for (let x = outer; x < inner; x += 2) samples.push(texture[row + x]);
		for (let x = width - inner; x < width - outer; x += 2) samples.push(texture[row + x]);
	}
	for (let y = outer; y < inner; y += 2) {
		const row = y * width;
		for (let x = inner; x < width - inner; x += 2) samples.push(texture[row + x]);
	}
	for (let y = height - inner; y < height - outer; y += 2) {
		const row = y * width;
		for (let x = inner; x < width - inner; x += 2) samples.push(texture[row + x]);
	}
	if (samples.length === 0) return 0;
	samples.sort((a, b) => a - b);
	return samples[Math.floor(samples.length * quantile)] ?? 0;
}

/**
 * Estimates paper chromaticity (illumination-invariant colour ratios) and luminance
 * from the central 40% x 40% of the frame (excluding the darkest 25% of pixels,
 * which are pen ink) and assigns each pixel a 0..1 similarity to the paper.
 * Using normalised chromaticity (R/(R+G+B), G/(R+G+B)) allows a single page to stay
 * connected even when a strong shadow falls across half of the sheet.
 */
function buildCenterPaperLikelihoodMask(
	gray: Uint8Array,
	rgb: Uint8Array | null,
	width: number,
	height: number,
): Float32Array {
	const x0 = Math.floor(width * 0.3);
	const x1 = Math.ceil(width * 0.7);
	const y0 = Math.floor(height * 0.3);
	const y1 = Math.ceil(height * 0.7);

	const centerLums: number[] = [];
	for (let y = y0; y < y1; y++) {
		for (let x = x0; x < x1; x++) {
			centerLums.push(gray[y * width + x]);
		}
	}
	centerLums.sort((a, b) => a - b);
	const inkFloor = centerLums[Math.floor(centerLums.length * 0.25)] ?? 0;

	const paperLums: number[] = [];
	const rChromaSamples: number[] = [];
	const gChromaSamples: number[] = [];
	for (let y = y0; y < y1; y++) {
		for (let x = x0; x < x1; x++) {
			const idx = y * width + x;
			if (gray[idx] < inkFloor) continue;
			paperLums.push(gray[idx]);
			if (rgb) {
				const r = rgb[idx * 3];
				const g = rgb[idx * 3 + 1];
				const b = rgb[idx * 3 + 2];
				const sum = Math.max(1, r + g + b);
				rChromaSamples.push((r / sum) * 255);
				gChromaSamples.push((g / sum) * 255);
			}
		}
	}

	const medianLum = medianOfSorted(paperLums.sort((a, b) => a - b), 180);
	const lumSpread = Math.max(
		36,
		madFromMedian(paperLums, medianLum) * 4.2,
	);

	let medianRChroma = 85;
	let medianGChroma = 85;
	let spreadRChroma = 6;
	let spreadGChroma = 6;
	if (rgb && rChromaSamples.length > 0) {
		const sortedR = [...rChromaSamples].sort((a, b) => a - b);
		const sortedG = [...gChromaSamples].sort((a, b) => a - b);
		medianRChroma = medianOfSorted(sortedR, 85);
		medianGChroma = medianOfSorted(sortedG, 85);
		spreadRChroma = Math.max(4.5, madFromMedian(rChromaSamples, medianRChroma, 1.8) * 3.2);
		spreadGChroma = Math.max(4.5, madFromMedian(gChromaSamples, medianGChroma, 1.8) * 3.2);
	}

	const minPaperLum = Math.max(45, medianLum * 0.42);
	const maxPaperLum = Math.min(255, medianLum * 1.45 + 25);

	const likelihood = new Float32Array(width * height);
	for (let i = 0; i < gray.length; i++) {
		const lum = gray[i];
		if (!rgb) {
			const lumDiff = Math.abs(lum - medianLum) / lumSpread;
			likelihood[i] = Math.max(0, 1 - lumDiff * 0.65);
			continue;
		}
		if (lum < minPaperLum || lum > maxPaperLum) {
			likelihood[i] = 0;
			continue;
		}
		const r = rgb[i * 3];
		const g = rgb[i * 3 + 1];
		const b = rgb[i * 3 + 2];
		const sum = Math.max(1, r + g + b);
		const rChroma = (r / sum) * 255;
		const gChroma = (g / sum) * 255;
		// Illumination-invariant chromaticity keeps shadowed paper connected while
		// separating skin tones (higher R/(R+G+B), lower G/(R+G+B)) and cool screens.
		const diffR = Math.abs(rChroma - medianRChroma) / spreadRChroma;
		const diffG = Math.abs(gChroma - medianGChroma) / spreadGChroma;
		const chromaMax = Math.max(diffR, diffG);
		// Asymmetric luminance penalty: shadowed paper (darker than median) is penalised
		// gently so a hand/phone shadow does not chop the page in half.
		const lumPenalty = lum < medianLum
			? (medianLum - lum) / Math.max(85, medianLum * 0.95)
			: (lum - medianLum) / lumSpread;
		const combined = Math.max(chromaMax * 0.58, lumPenalty * 0.45);
		likelihood[i] = Math.max(0, 1 - combined);
	}
	return likelihood;
}

function medianOfSorted(sorted: number[], fallback: number): number {
	if (sorted.length === 0) return fallback;
	return sorted[Math.floor(sorted.length / 2)];
}

function madFromMedian(values: number[], median: number, minMad = 4): number {
	if (values.length === 0) return 10;
	const devs = values.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
	return Math.max(minMad, devs[Math.floor(devs.length * 0.7)] ?? 10);
}

function thresholdPaperMask(likelihood: Float32Array, strictness: number): Uint8Array {
	const cutoff = clamp(0.42 * strictness, 0.22, 0.68);
	const out = new Uint8Array(likelihood.length);
	for (let i = 0; i < likelihood.length; i++) {
		if (likelihood[i] >= cutoff) out[i] = 1;
	}
	return out;
}

function closeBinaryMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
	return erodeBinaryMask(dilateBinaryMask(mask, width, height, radius), width, height, radius);
}

function dilateBinaryMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
	const horiz = new Uint8Array(mask.length);
	for (let y = 0; y < height; y++) {
		const row = y * width;
		for (let x = 0; x < width; x++) {
			const x0 = Math.max(0, x - radius);
			const x1 = Math.min(width - 1, x + radius);
			let on = 0;
			for (let xx = x0; xx <= x1; xx++) {
				if (mask[row + xx] === 1) {
					on = 1;
					break;
				}
			}
			horiz[row + x] = on;
		}
	}
	const out = new Uint8Array(mask.length);
	for (let y = 0; y < height; y++) {
		const y0 = Math.max(0, y - radius);
		const y1 = Math.min(height - 1, y + radius);
		for (let x = 0; x < width; x++) {
			let on = 0;
			for (let yy = y0; yy <= y1; yy++) {
				if (horiz[yy * width + x] === 1) {
					on = 1;
					break;
				}
			}
			out[y * width + x] = on;
		}
	}
	return out;
}

function erodeBinaryMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
	const horiz = new Uint8Array(mask.length);
	for (let y = 0; y < height; y++) {
		const row = y * width;
		for (let x = 0; x < width; x++) {
			const x0 = Math.max(0, x - radius);
			const x1 = Math.min(width - 1, x + radius);
			let on = 1;
			for (let xx = x0; xx <= x1; xx++) {
				if (mask[row + xx] !== 1) {
					on = 0;
					break;
				}
			}
			horiz[row + x] = on;
		}
	}
	const out = new Uint8Array(mask.length);
	for (let y = 0; y < height; y++) {
		const y0 = Math.max(0, y - radius);
		const y1 = Math.min(height - 1, y + radius);
		for (let x = 0; x < width; x++) {
			let on = 1;
			for (let yy = y0; yy <= y1; yy++) {
				if (horiz[yy * width + x] !== 1) {
					on = 0;
					break;
				}
			}
			out[y * width + x] = on;
		}
	}
	return out;
}

function extractDominantCentralComponent(
	mask: Uint8Array,
	width: number,
	height: number,
): Uint8Array | null {
	const seen = new Uint8Array(mask.length);
	const cx0 = Math.floor(width * 0.35);
	const cx1 = Math.ceil(width * 0.65);
	const cy0 = Math.floor(height * 0.35);
	const cy1 = Math.ceil(height * 0.65);

	let bestPixels: number[] | null = null;
	let bestScore = 0;

	for (let y = cy0; y < cy1; y++) {
		for (let x = cx0; x < cx1; x++) {
			const start = y * width + x;
			if (mask[start] !== 1 || seen[start] === 1) continue;
			const pixels: number[] = [];
			const stack = [start];
			seen[start] = 1;
			let centerHits = 0;
			while (stack.length > 0) {
				const idx = stack.pop()!;
				pixels.push(idx);
				const px = idx % width;
				const py = Math.floor(idx / width);
				if (px >= cx0 && px < cx1 && py >= cy0 && py < cy1) centerHits++;
				if (px > 0 && mask[idx - 1] === 1 && seen[idx - 1] === 0) {
					seen[idx - 1] = 1;
					stack.push(idx - 1);
				}
				if (px + 1 < width && mask[idx + 1] === 1 && seen[idx + 1] === 0) {
					seen[idx + 1] = 1;
					stack.push(idx + 1);
				}
				if (py > 0 && mask[idx - width] === 1 && seen[idx - width] === 0) {
					seen[idx - width] = 1;
					stack.push(idx - width);
				}
				if (py + 1 < height && mask[idx + width] === 1 && seen[idx + width] === 0) {
					seen[idx + width] = 1;
					stack.push(idx + width);
				}
			}
			const score = pixels.length + centerHits * 2;
			if (score > bestScore) {
				bestScore = score;
				bestPixels = pixels;
			}
		}
	}

	if (!bestPixels || bestPixels.length < width * height * MIN_AREA_RATIO * 0.6) return null;
	const out = new Uint8Array(mask.length);
	for (const idx of bestPixels) out[idx] = 1;
	return out;
}

function extractMaskBoundaryPoints(mask: Uint8Array, width: number, height: number): PagePoint[] {
	const points: PagePoint[] = [];
	for (let y = 0; y < height; y++) {
		const row = y * width;
		for (let x = 0; x < width; x++) {
			const idx = row + x;
			if (mask[idx] !== 1) continue;
			const isBoundary = x === 0
				|| y === 0
				|| x === width - 1
				|| y === height - 1
				|| mask[idx - 1] === 0
				|| mask[idx + 1] === 0
				|| mask[idx - width] === 0
				|| mask[idx + width] === 0;
			if (isBoundary) points.push({ x, y });
		}
	}
	return points;
}

function boxBlur(gray: Uint8Array, width: number, height: number): Uint8Array {
	const out = new Uint8Array(width * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let sum = 0;
			let count = 0;
			for (let dy = -1; dy <= 1; dy++) {
				const yy = y + dy;
				if (yy < 0 || yy >= height) continue;
				for (let dx = -1; dx <= 1; dx++) {
					const xx = x + dx;
					if (xx < 0 || xx >= width) continue;
					sum += gray[yy * width + xx];
					count++;
				}
			}
			out[y * width + x] = Math.round(sum / count);
		}
	}
	return out;
}

function sobelEdges(gray: Uint8Array, width: number, height: number): Float32Array {
	const mag = new Float32Array(width * height);
	for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
			const tl = gray[(y - 1) * width + (x - 1)];
			const tc = gray[(y - 1) * width + x];
			const tr = gray[(y - 1) * width + (x + 1)];
			const ml = gray[y * width + (x - 1)];
			const mr = gray[y * width + (x + 1)];
			const bl = gray[(y + 1) * width + (x - 1)];
			const bc = gray[(y + 1) * width + x];
			const br = gray[(y + 1) * width + (x + 1)];
			const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
			const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
			mag[y * width + x] = Math.hypot(gx, gy);
		}
	}
	return mag;
}

function thresholdEdges(mag: Float32Array, quantile = 0.9): Uint8Array {
	const samples: number[] = [];
	for (let i = 0; i < mag.length; i += 3) {
		if (mag[i] > 8) samples.push(mag[i]);
	}
	samples.sort((a, b) => a - b);
	let cutoff = 40;
	if (samples.length > 0) {
		const index = Math.min(samples.length - 1, Math.floor(samples.length * quantile));
		cutoff = Math.max(24, samples[index]);
	}
	const binary = new Uint8Array(mag.length);
	for (let i = 0; i < mag.length; i++) {
		if (mag[i] >= cutoff) binary[i] = 1;
	}
	return binary;
}

function traceContours(binary: Uint8Array, width: number, height: number): PagePoint[][] {
	const seen = new Uint8Array(binary.length);
	const contours: PagePoint[][] = [];
	for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
			const index = y * width + x;
			if (binary[index] !== 1 || seen[index] === 1) continue;
			const contour = traceContour(binary, width, height, x, y);
			for (const point of contour) {
				seen[point.y * width + point.x] = 1;
			}
			if (contour.length >= 24) contours.push(contour);
		}
	}
	return contours;
}

function traceContour(
	binary: Uint8Array,
	width: number,
	height: number,
	startX: number,
	startY: number,
): PagePoint[] {
	const stepX = [1, 1, 0, -1, -1, -1, 0, 1];
	const stepY = [0, 1, 1, 1, 0, -1, -1, -1];
	const points: PagePoint[] = [];
	let x = startX;
	let y = startY;
	let direction = 0;
	const maxSteps = width * height;
	for (let step = 0; step < maxSteps; step++) {
		points.push({ x, y });
		const searchFrom = (direction + 5) % 8;
		let found = false;
		for (let turn = 0; turn < 8; turn++) {
			const nextDirection = (searchFrom + turn) % 8;
			const nextX = x + stepX[nextDirection];
			const nextY = y + stepY[nextDirection];
			if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
			if (binary[nextY * width + nextX] !== 1) continue;
			if (nextX === startX && nextY === startY && points.length > 8) {
				return points;
			}
			x = nextX;
			y = nextY;
			direction = nextDirection;
			found = true;
			break;
		}
		if (!found) break;
	}
	return points;
}

function convexHull(points: PagePoint[]): PagePoint[] {
	const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
	const unique: PagePoint[] = [];
	for (const point of sorted) {
		const previous = unique[unique.length - 1];
		if (previous && previous.x === point.x && previous.y === point.y) continue;
		unique.push(point);
	}
	if (unique.length < 4) return unique;
	const lower: PagePoint[] = [];
	for (const point of unique) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
			lower.pop();
		}
		lower.push(point);
	}
	const upper: PagePoint[] = [];
	for (let i = unique.length - 1; i >= 0; i--) {
		const point = unique[i];
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
			upper.pop();
		}
		upper.push(point);
	}
	lower.pop();
	upper.pop();
	return lower.concat(upper);
}

function cross(origin: PagePoint, a: PagePoint, b: PagePoint): number {
	return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

/**
 * Fits 4-corner quads to a segmented paper region:
 * - Minimum-area oriented bounding boxes that tightly wrap the paper mask,
 * - Plus hull extrema and max-area inscribed hull quads.
 */
function fitCandidateQuadsFromRegion(
	mask: Uint8Array,
	boundary: PagePoint[],
	width: number,
	height: number,
): [PagePoint, PagePoint, PagePoint, PagePoint][] {
	const hull = convexHull(boundary);
	const results = fitCandidateQuadsFromHull(hull);

	// Fit percentile-trimmed oriented bounding boxes across small tilt angles so a single
	// protruding corner or background leak does not skew one side of the quad.
	for (const angleDeg of [-6, -3, 0, 3, 6]) {
		const rad = (angleDeg * Math.PI) / 180;
		const cos = Math.cos(rad);
		const sin = Math.sin(rad);
		const projU: number[] = [];
		const projV: number[] = [];
		for (const p of boundary) {
			projU.push(p.x * cos + p.y * sin);
			projV.push(-p.x * sin + p.y * cos);
		}
		projU.sort((a, b) => a - b);
		projV.sort((a, b) => a - b);
		for (const trim of [0.01, 0.03]) {
			const u0 = projU[Math.floor(projU.length * trim)] ?? projU[0];
			const u1 = projU[Math.min(projU.length - 1, Math.floor(projU.length * (1 - trim)))] ?? projU[projU.length - 1];
			const v0 = projV[Math.floor(projV.length * trim)] ?? projV[0];
			const v1 = projV[Math.min(projV.length - 1, Math.floor(projV.length * (1 - trim)))] ?? projV[projV.length - 1];
			const unrotate = (u: number, v: number): PagePoint => ({
				x: clamp(u * cos - v * sin, 0, width),
				y: clamp(u * sin + v * cos, 0, height),
			});
			results.push(orderQuadCorners([
				unrotate(u0, v0),
				unrotate(u1, v0),
				unrotate(u1, v1),
				unrotate(u0, v1),
			]));
		}
	}

	// Also refine each side independently by linear regression on the top/bottom/left/right
	// outermost mask pixels for the middle 70% of each span.
	const sideFitted = fitFourSideLinesToMask(mask, width, height);
	if (sideFitted) results.push(sideFitted);

	return results;
}

function fitFourSideLinesToMask(
	mask: Uint8Array,
	width: number,
	height: number,
): [PagePoint, PagePoint, PagePoint, PagePoint] | null {
	let minX = width;
	let maxX = 0;
	let minY = height;
	let maxY = 0;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (mask[y * width + x] !== 1) continue;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}
	}
	const spanX = maxX - minX;
	const spanY = maxY - minY;
	if (spanX < 20 || spanY < 20) return null;

	const leftPts: PagePoint[] = [];
	const rightPts: PagePoint[] = [];
	const yStart = Math.floor(minY + spanY * 0.15);
	const yEnd = Math.ceil(maxY - spanY * 0.15);
	for (let y = yStart; y <= yEnd; y++) {
		let firstX = -1;
		let lastX = -1;
		for (let x = minX; x <= maxX; x++) {
			if (mask[y * width + x] === 1) {
				if (firstX < 0) firstX = x;
				lastX = x;
			}
		}
		if (firstX >= 0 && lastX - firstX >= spanX * 0.4) {
			leftPts.push({ x: firstX, y });
			rightPts.push({ x: lastX, y });
		}
	}

	const topPts: PagePoint[] = [];
	const bottomPts: PagePoint[] = [];
	const xStart = Math.floor(minX + spanX * 0.15);
	const xEnd = Math.ceil(maxX - spanX * 0.15);
	for (let x = xStart; x <= xEnd; x++) {
		let firstY = -1;
		let lastY = -1;
		for (let y = minY; y <= maxY; y++) {
			if (mask[y * width + x] === 1) {
				if (firstY < 0) firstY = y;
				lastY = y;
			}
		}
		if (firstY >= 0 && lastY - firstY >= spanY * 0.4) {
			topPts.push({ x, y: firstY });
			bottomPts.push({ x, y: lastY });
		}
	}

	if (leftPts.length < 8 || rightPts.length < 8 || topPts.length < 8 || bottomPts.length < 8) {
		return null;
	}

	const topLine = fitRobustLineYOfX(topPts);
	const bottomLine = fitRobustLineYOfX(bottomPts);
	const leftLine = fitRobustLineXOfY(leftPts);
	const rightLine = fitRobustLineXOfY(rightPts);

	const tl = intersectLines(topLine, leftLine);
	const tr = intersectLines(topLine, rightLine);
	const br = intersectLines(bottomLine, rightLine);
	const bl = intersectLines(bottomLine, leftLine);
	if (!tl || !tr || !br || !bl) return null;
	return orderQuadCorners([tl, tr, br, bl]);
}

function fitRobustLineYOfX(points: PagePoint[]): { m: number; c: number } {
	// Median-slope (Theil–Sen style on outer quartiles) resists torn notches along the top edge.
	const q1 = points[Math.floor(points.length * 0.2)];
	const q3 = points[Math.floor(points.length * 0.8)];
	const m = q3.x !== q1.x ? (q3.y - q1.y) / (q3.x - q1.x) : 0;
	const intercepts = points.map((p) => p.y - m * p.x).sort((a, b) => a - b);
	const c = intercepts[Math.floor(intercepts.length / 2)] ?? 0;
	return { m, c };
}

function fitRobustLineXOfY(points: PagePoint[]): { m: number; c: number } {
	const q1 = points[Math.floor(points.length * 0.2)];
	const q3 = points[Math.floor(points.length * 0.8)];
	const m = q3.y !== q1.y ? (q3.x - q1.x) / (q3.y - q1.y) : 0;
	const intercepts = points.map((p) => p.x - m * p.y).sort((a, b) => a - b);
	const c = intercepts[Math.floor(intercepts.length / 2)] ?? 0;
	return { m, c };
}

function intersectLines(
	yOfX: { m: number; c: number },
	xOfY: { m: number; c: number },
): PagePoint | null {
	const denom = 1 - yOfX.m * xOfY.m;
	if (Math.abs(denom) < 1e-4) return null;
	const y = (yOfX.m * xOfY.c + yOfX.c) / denom;
	const x = xOfY.m * y + xOfY.c;
	return { x, y };
}
function fitCandidateQuadsFromHull(
	hull: PagePoint[],
): [PagePoint, PagePoint, PagePoint, PagePoint][] {
	if (hull.length < 4) return [];
	if (hull.length === 4) return [orderQuadCorners(hull)];

	const results: [PagePoint, PagePoint, PagePoint, PagePoint][] = [];
	const maxInscribed = findMaxAreaQuadOnHull(hull);
	if (maxInscribed) results.push(orderQuadCorners(maxInscribed));

	for (const angleDeg of [0, 8, -8, 16, -16]) {
		const rad = (angleDeg * Math.PI) / 180;
		const cos = Math.cos(rad);
		const sin = Math.sin(rad);
		let tl = hull[0];
		let tr = hull[0];
		let br = hull[0];
		let bl = hull[0];
		let minSum = Infinity;
		let maxSum = -Infinity;
		let maxDiff = -Infinity;
		let minDiff = Infinity;
		for (const p of hull) {
			const rx = p.x * cos - p.y * sin;
			const ry = p.x * sin + p.y * cos;
			const sum = rx + ry;
			const diff = rx - ry;
			if (sum < minSum) {
				minSum = sum;
				tl = p;
			}
			if (sum > maxSum) {
				maxSum = sum;
				br = p;
			}
			if (diff > maxDiff) {
				maxDiff = diff;
				tr = p;
			}
			if (diff < minDiff) {
				minDiff = diff;
				bl = p;
			}
		}
		results.push(orderQuadCorners([tl, tr, br, bl]));
	}

	return results;
}

function findMaxAreaQuadOnHull(hull: PagePoint[]): PagePoint[] | null {
	const maxVertices = 36;
	const step = Math.max(1, Math.floor(hull.length / maxVertices));
	const sampled: PagePoint[] = [];
	for (let i = 0; i < hull.length; i += step) {
		sampled.push(hull[i]);
	}
	const n = sampled.length;
	if (n < 4) return null;

	let bestArea = 0;
	let bestQuad: PagePoint[] | null = null;
	for (let a = 0; a < n - 3; a++) {
		for (let b = a + 1; b < n - 2; b++) {
			for (let c = b + 1; c < n - 1; c++) {
				for (let d = c + 1; d < n; d++) {
					const quad = [sampled[a], sampled[b], sampled[c], sampled[d]];
					const area = polygonArea(quad);
					if (area > bestArea) {
						bestArea = area;
						bestQuad = quad;
					}
				}
			}
		}
	}
	return bestQuad;
}

function polygonArea(points: PagePoint[]): number {
	let sum = 0;
	for (let i = 0; i < points.length; i++) {
		const next = points[(i + 1) % points.length];
		sum += points[i].x * next.y - next.x * points[i].y;
	}
	return Math.abs(sum) / 2;
}

function quadSidesAreSubstantial(quad: PagePoint[], width: number, height: number): boolean {
	const minSide = Math.min(width, height) * 0.18;
	for (let i = 0; i < quad.length; i++) {
		const next = quad[(i + 1) % quad.length];
		if (Math.hypot(next.x - quad[i].x, next.y - quad[i].y) < minSide) return false;
	}
	return true;
}

/**
 * Rejects concave, self-intersecting, or skewed/wedged quads where interior angles
 * collapse (< 50 deg or > 135 deg) or opposite sides have wildly mismatched lengths.
 */
function quadGeometryIsPlausible(quad: [PagePoint, PagePoint, PagePoint, PagePoint]): boolean {
	const minCos = Math.cos((135 * Math.PI) / 180);
	const maxCos = Math.cos((50 * Math.PI) / 180);
	let sign = 0;
	const sideLengths: number[] = [];

	for (let i = 0; i < 4; i++) {
		const prev = quad[(i + 3) % 4];
		const curr = quad[i];
		const next = quad[(i + 1) % 4];
		const v1x = prev.x - curr.x;
		const v1y = prev.y - curr.y;
		const v2x = next.x - curr.x;
		const v2y = next.y - curr.y;
		const len1 = Math.hypot(v1x, v1y);
		const len2 = Math.hypot(v2x, v2y);
		if (len1 < 8 || len2 < 8) return false;
		sideLengths.push(len2);

		const crossVal = v1x * v2y - v1y * v2x;
		const currentSign = crossVal >= 0 ? 1 : -1;
		if (sign === 0) sign = currentSign;
		else if (sign !== currentSign) return false;

		const cosAngle = (v1x * v2x + v1y * v2y) / (len1 * len2);
		if (cosAngle < minCos || cosAngle > maxCos) return false;
	}

	const topBottomRatio = Math.max(sideLengths[0], sideLengths[2]) / Math.max(1, Math.min(sideLengths[0], sideLengths[2]));
	const leftRightRatio = Math.max(sideLengths[1], sideLengths[3]) / Math.max(1, Math.min(sideLengths[1], sideLengths[3]));
	if (topBottomRatio > 1.45 || leftRightRatio > 1.45) return false;

	return true;
}

function scoreCandidateQuad(
	quad: [PagePoint, PagePoint, PagePoint, PagePoint],
	paperLikelihood: Float32Array,
	edges: Float32Array,
	width: number,
	height: number,
): number {
	const cx = width * 0.5;
	const cy = height * 0.5;
	if (!pointInConvexQuad({ x: cx, y: cy }, quad)) return -1;

	let insideSum = 0;
	let insideNonPaper = 0;
	let insideCount = 0;
	let outsideSum = 0;
	let outsidePaperPixels = 0;
	let outsideCount = 0;

	const step = 3;
	for (let y = 2; y < height - 2; y += step) {
		for (let x = 2; x < width - 2; x += step) {
			const pt = { x, y };
			const p = paperLikelihood[y * width + x];
			if (pointInConvexQuad(pt, quad)) {
				insideSum += p;
				if (p < 0.35) insideNonPaper++;
				insideCount++;
			} else {
				outsideSum += p;
				if (p >= 0.55) outsidePaperPixels++;
				outsideCount++;
			}
		}
	}

	if (insideCount < 16) return -1;
	const insidePaper = insideSum / insideCount;
	const nonPaperFraction = insideNonPaper / insideCount;
	// A page with handwriting has up to ~15% dark ink pixels; much more than that
	// means the quad swallowed dark desk, hand, or monitor regions.
	const impurityPenalty = Math.max(0, nonPaperFraction - 0.12) * 1.6;
	const missedPaperFraction = outsidePaperPixels / Math.max(1, insideCount + outsidePaperPixels);
	const outsidePaper = outsideCount > 0 ? outsideSum / outsideCount : 0.5;
	const paperContrast = insidePaper - outsidePaper * 0.6;

	// Sample Sobel gradient support and step-change across the 4 quad edges.
	let edgeSupportSum = 0;
	let edgeSamples = 0;
	for (let i = 0; i < 4; i++) {
		const a = quad[i];
		const b = quad[(i + 1) % 4];
		const segLen = Math.hypot(b.x - a.x, b.y - a.y);
		const nx = -(b.y - a.y) / Math.max(1, segLen);
		const ny = (b.x - a.x) / Math.max(1, segLen);
		const samples = Math.max(8, Math.min(32, Math.round(segLen / 4)));
		for (let s = 1; s < samples; s++) {
			const t = s / samples;
			const px = Math.round(a.x + (b.x - a.x) * t);
			const py = Math.round(a.y + (b.y - a.y) * t);
			if (px < 2 || py < 2 || px >= width - 2 || py >= height - 2) continue;
			let maxGrad = 0;
			for (let offset = -2; offset <= 2; offset++) {
				const gx = clamp(Math.round(px + nx * offset), 1, width - 2);
				const gy = clamp(Math.round(py + ny * offset), 1, height - 2);
				const g = edges[gy * width + gx];
				if (g > maxGrad) maxGrad = g;
			}
			edgeSupportSum += Math.min(1, maxGrad / 85);
			edgeSamples++;
		}
	}
	const edgeSupport = edgeSamples > 0 ? edgeSupportSum / edgeSamples : 0;

	// Reward rectangularity (angles close to 90 deg).
	let anglePenalty = 0;
	for (let i = 0; i < 4; i++) {
		const prev = quad[(i + 3) % 4];
		const curr = quad[i];
		const next = quad[(i + 1) % 4];
		const v1x = prev.x - curr.x;
		const v1y = prev.y - curr.y;
		const v2x = next.x - curr.x;
		const v2y = next.y - curr.y;
		const cos = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y));
		anglePenalty += Math.abs(cos);
	}
	const rectangularity = Math.max(0, 1 - anglePenalty / 1.2);
	const areaRatio = polygonArea(quad) / (width * height);

	// Check that the 4 corners themselves sit on or immediately beside paper pixels,
	// not out in the dark background or monitor bezel.
	let cornerPaperSum = 0;
	for (const corner of quad) {
		let bestCornerPaper = 0;
		const cx0 = clamp(Math.round(corner.x) - 6, 0, width - 1);
		const cx1 = clamp(Math.round(corner.x) + 6, 0, width - 1);
		const cy0 = clamp(Math.round(corner.y) - 6, 0, height - 1);
		const cy1 = clamp(Math.round(corner.y) + 6, 0, height - 1);
		for (let yy = cy0; yy <= cy1; yy++) {
			for (let xx = cx0; xx <= cx1; xx++) {
				const p = paperLikelihood[yy * width + xx];
				if (p > bestCornerPaper) bestCornerPaper = p;
			}
		}
		cornerPaperSum += bestCornerPaper;
	}
	const cornerPaperScore = cornerPaperSum / 4;
	if (cornerPaperScore < 0.35) return -1;

	return (
		insidePaper * 0.5
		+ paperContrast * 0.35
		+ cornerPaperScore * 0.3
		- impurityPenalty
		- missedPaperFraction * 0.65
		+ edgeSupport * 0.2
		+ rectangularity * 0.3
		+ Math.min(0.75, areaRatio) * 0.1
	);
}

function pointInConvexQuad(
	point: PagePoint,
	quad: [PagePoint, PagePoint, PagePoint, PagePoint],
): boolean {
	let sign = 0;
	for (let i = 0; i < 4; i++) {
		const a = quad[i];
		const b = quad[(i + 1) % 4];
		const c = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
		if (Math.abs(c) < 1e-5) continue;
		const s = c > 0 ? 1 : -1;
		if (sign === 0) sign = s;
		else if (sign !== s) return false;
	}
	return true;
}

function orderQuadCorners(points: PagePoint[]): [PagePoint, PagePoint, PagePoint, PagePoint] {
	let cx = 0;
	let cy = 0;
	for (const point of points) {
		cx += point.x;
		cy += point.y;
	}
	cx /= points.length;
	cy /= points.length;

	const sorted = [...points].sort(
		(a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
	);
	let topLeftIndex = 0;
	let bestSum = Infinity;
	for (let i = 0; i < sorted.length; i++) {
		const sum = sorted[i].x + sorted[i].y;
		if (sum < bestSum) {
			bestSum = sum;
			topLeftIndex = i;
		}
	}
	return [
		{ ...sorted[topLeftIndex] },
		{ ...sorted[(topLeftIndex + 1) % 4] },
		{ ...sorted[(topLeftIndex + 2) % 4] },
		{ ...sorted[(topLeftIndex + 3) % 4] },
	];
}

function cornersAreDistinct(corners: PagePoint[]): boolean {
	for (let i = 0; i < corners.length; i++) {
		for (let j = i + 1; j < corners.length; j++) {
			if (Math.hypot(corners[i].x - corners[j].x, corners[i].y - corners[j].y) < 8) return false;
		}
	}
	return true;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
