import { nanoid } from 'nanoid';
import { WRITING_LINE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';
import type { InkPoint, InkStroke } from 'src/ink-canvas/types';
import { DEFAULT_STROKE_STYLE } from 'src/ink-canvas/types';

//////////
//////////

export interface PhotoTraceRasterInput {
	width: number;
	height: number;
	/** Grayscale 0–255, row-major length width * height */
	gray: Uint8Array;
	/**
	 * When the user cropped inside the photo, drop large components that touch the
	 * crop edge (fingers, leftover page border). Skip this on a full-frame photo so
	 * a letter that touches the edge is kept.
	 */
	dropLargeBorderComponents?: boolean;
	/** Ramer–Douglas–Peucker epsilon in source pixels. Lower keeps more of the pen. */
	simplifyEpsilon?: number;
	/** Drop skeleton fragments shorter than this, in source pixels. Dots are kept. */
	minPolylineLengthPx?: number;
	/** Sauvola k. Lower keeps fainter pen strokes after lighting has been flattened. */
	sauvolaK?: number;
	/** When true (default), removes tiny specks and isolated margin/paper noise dots. */
	noiseCleanup?: boolean;
}

/** Long-edge cap for the canvas that corners, warp, and trace read. */
export const PHOTO_TRACE_WORKING_MAX_EDGE_PX = 4096;
/** Long edge for corner pins, the page warp, and the local trace. There is no resolution slider. */
export const PHOTO_TRACE_DEFAULT_EDGE_PX = 1600;
/** Adjust-step preview long edge so slider paints stay cheap. */
export const PHOTO_TRACE_PREVIEW_MAX_EDGE_PX = 1000;
/** Long-edge floor when the user turns Resolution down. */
export const PHOTO_TRACE_MIN_EDGE_PX = 800;
/**
 * Convert always uses this detail. There is no detail slider.
 * 90 maps to about 0.48px of simplification. 100 would be the finest setting.
 */
export const PHOTO_TRACE_DEFAULT_DETAIL = 90;
/** Ink sensitivity whose Sauvola k is 0.20. Higher keeps fainter strokes. */
export const PHOTO_TRACE_DEFAULT_INK_SENSITIVITY = 75;
export const PHOTO_TRACE_DEFAULT_RESOLUTION = Math.round(
	((PHOTO_TRACE_DEFAULT_EDGE_PX - PHOTO_TRACE_MIN_EDGE_PX)
		/ (PHOTO_TRACE_WORKING_MAX_EDGE_PX - PHOTO_TRACE_MIN_EDGE_PX)) * 100,
);

/**
 * Maps the Detail slider (0–100) onto how tightly polylines follow the skeleton.
 * 0 is a coarse centreline. 100 keeps almost every wiggle.
 */
export function photoTraceSimplifyEpsilon(detail: number): number {
	const unit = clampSlider(detail) / 100;
	// 0 is a coarse centreline (2.0px). 90 is ~0.48px. 100 keeps tight loops (0.32px).
	return 2.0 - unit * 1.68;
}

/**
 * Maps Ink sensitivity (0–100) onto Sauvola k.
 * 0 keeps only dark ink. 100 keeps faint strokes. 75 is k = 0.20.
 */
export function photoTraceSauvolaK(sensitivity: number): number {
	const unit = clampSlider(sensitivity) / 100;
	return 0.5 - unit * 0.4;
}

/**
 * Maps the Detail slider onto the shortest stroke the tracer keeps.
 */
export function photoTraceMinPolylineLength(detail: number): number {
	const unit = clampSlider(detail) / 100;
	return Math.max(1, Math.round(20 - unit * 19));
}

/**
 * Maps the Resolution slider onto the long-edge pixel cap for the raster that is traced.
 */
export function photoTraceMaxEdgePx(resolution: number): number {
	const unit = clampSlider(resolution) / 100;
	return Math.round(
		PHOTO_TRACE_MIN_EDGE_PX + unit * (PHOTO_TRACE_WORKING_MAX_EDGE_PX - PHOTO_TRACE_MIN_EDGE_PX),
	);
}

function clampSlider(value: number): number {
	return Math.min(100, Math.max(0, value));
}

export interface PhotoTraceResult {
	strokes: InkStroke[];
	writingLineHeight: number;
}

const DEFAULT_SIMPLIFY_EPSILON = photoTraceSimplifyEpsilon(PHOTO_TRACE_DEFAULT_DETAIL);
const DEFAULT_MIN_POLYLINE_LENGTH_PX = photoTraceMinPolylineLength(PHOTO_TRACE_DEFAULT_DETAIL);
const DEFAULT_SAUVOLA_K = photoTraceSauvolaK(PHOTO_TRACE_DEFAULT_INK_SENSITIVITY);

/**
 * Traces dark-or-light ink on a photo into ink-canvas stroke centreline points in page space.
 */
export function traceHandwritingFromRaster(input: PhotoTraceRasterInput): PhotoTraceResult {
	const binary = buildPhotoInkMask(
		input.gray,
		input.width,
		input.height,
		input.sauvolaK ?? DEFAULT_SAUVOLA_K,
		input.dropLargeBorderComponents ?? false,
		input.noiseCleanup ?? true,
	);
	const radius = inkRadiusMap(binary, input.width, input.height);
	const skeleton = zhangSuenThinImpl(binary, input.width, input.height);
	const traced = traceSkeletonPolylines(skeleton, input.width, input.height)
		.filter((line) => !polylineHugsRasterBorder(line.points, input.width, input.height));
	const simplifyEpsilon = input.simplifyEpsilon ?? DEFAULT_SIMPLIFY_EPSILON;
	const minPolylineLengthPx = input.minPolylineLengthPx ?? DEFAULT_MIN_POLYLINE_LENGTH_PX;
	const simplified = traced
		.map((line) => ({
			points: simplifyPolyline(smoothPolyline(line.points), simplifyEpsilon),
			isDot: line.isDot,
		}))
		.filter((line) => {
			// A straight pen mark simplifies to two points. Keep it when it is long enough.
			// Dots are short on purpose and skip that length test.
			if (line.isDot) return line.points.length >= 2;
			return line.points.length >= 2 && polylineLength(line.points) >= minPolylineLengthPx;
		});
	const mapped = mapPolylinesToWritingPage(simplified, radius, input.width, input.height);
	const strokes = mapped.map((line) => polylineToInkStroke(line.points, smoothRadii(line.radii)));
	// Guide spacing is the standard writing line height. Stroke Y gaps are not
	// baselines, so guessing a height from them packed or stretched the lines.
	return { strokes, writingLineHeight: WRITING_LINE_HEIGHT };
}

/**
 * Sauvola ink mask for a grayscale page, with specks, isolated margin noise,
 * notebook rules, and edge artifacts cleaned up so the Adjust preview matches
 * what will be traced.
 */
export function buildPhotoInkMask(
	gray: Uint8Array,
	width: number,
	height: number,
	sauvolaK = DEFAULT_SAUVOLA_K,
	shouldDropLargeBorderComponents = true,
	noiseCleanup = true,
): Uint8Array {
	const binary = buildInkMask({ width, height, gray, sauvolaK });
	if (noiseCleanup) {
		removeTinySpecks(binary, width, height);
		removeContextualNoiseDots(binary, width, height);
	}
	bridgeSinglePixelGaps(binary, width, height);
	bridgeDiagonalThinGaps(binary, width, height);
	removeLongStraightRules(binary, width, height);
	if (shouldDropLargeBorderComponents) {
		dropLargeBorderComponents(binary, width, height);
	}
	return binary;
}

/**
 * Picks an Ink sensitivity (0–100) for an illumination-flattened grayscale page
 * by stepping Sauvola sensitivity down when the mask is peppered with tiny paper
 * grain specks, while keeping stroke pixels intact.
 */
export function autoSelectPhotoInkSensitivity(
	gray: Uint8Array,
	width: number,
	height: number,
): number {
	const shouldInvert = detectLightInkOnDarkPage(gray);
	const samples = new Uint8Array(gray.length);
	for (let i = 0; i < gray.length; i++) {
		samples[i] = shouldInvert ? 255 - gray[i] : gray[i];
	}
	const sum = buildSummedArea(samples, width, height, false);
	const sumSq = buildSummedArea(samples, width, height, true);
	const half = Math.floor(sauvolaWindow(width, height) / 2);

	const candidates = [35, 45, 55, 65, 72, 78, 84];
	const scored: { sensitivity: number; speckCount: number; validInkPixels: number }[] = [];
	let maxValidInk = 0;

	for (const sensitivity of candidates) {
		const sauvolaK = photoTraceSauvolaK(sensitivity);
		const mask = thresholdFromSummedArea(samples, sum, sumSq, width, height, half, sauvolaK);
		const stats = measureMaskSpecksAndInk(mask, width, height);
		if (stats.validInkPixels > maxValidInk) maxValidInk = stats.validInkPixels;
		scored.push({ sensitivity, ...stats });
	}

	if (maxValidInk === 0) return PHOTO_TRACE_DEFAULT_INK_SENSITIVITY;

	let bestSensitivity = PHOTO_TRACE_DEFAULT_INK_SENSITIVITY;
	let bestScore = -Infinity;
	for (const item of scored) {
		const strokeRetention = item.validInkPixels / maxValidInk;
		if (strokeRetention < 0.7) continue;
		// Penalise pepper noise (tiny 1–12px specks per thousand stroke pixels) while
		// preferring a sensitivity near 70 when the page is clean so margin specks are not pulled in.
		const speckRatio = (item.speckCount * 22) / Math.max(200, item.validInkPixels);
		const distanceFromTarget = Math.abs(item.sensitivity - 70) / 100;
		const score = strokeRetention - speckRatio - distanceFromTarget * 0.45;
		if (score > bestScore) {
			bestScore = score;
			bestSensitivity = item.sensitivity;
		}
	}
	return bestSensitivity;
}

function buildInkMask(input: PhotoTraceRasterInput): Uint8Array {
	const { width, height, gray } = input;
	const sauvolaK = input.sauvolaK ?? DEFAULT_SAUVOLA_K;
	const shouldInvert = detectLightInkOnDarkPage(gray);
	const samples = new Uint8Array(gray.length);
	for (let i = 0; i < gray.length; i++) {
		samples[i] = shouldInvert ? 255 - gray[i] : gray[i];
	}
	const sum = buildSummedArea(samples, width, height, false);
	const sumSq = buildSummedArea(samples, width, height, true);
	// Window must be wider than the pen. A 15px window on a page-sized crop
	// only sees ink, so the middle of each stroke falls back out of the mask.
	const half = Math.floor(sauvolaWindow(width, height) / 2);
	return thresholdFromSummedArea(samples, sum, sumSq, width, height, half, sauvolaK);
}

function thresholdFromSummedArea(
	samples: Uint8Array,
	sum: Float64Array,
	sumSq: Float64Array,
	width: number,
	height: number,
	half: number,
	sauvolaK: number,
): Uint8Array {
	const mask = new Uint8Array(width * height);
	for (let y = 0; y < height; y++) {
		const y0 = Math.max(0, y - half);
		const y1 = Math.min(height - 1, y + half);
		for (let x = 0; x < width; x++) {
			const x0 = Math.max(0, x - half);
			const x1 = Math.min(width - 1, x + half);
			const n = (x1 - x0 + 1) * (y1 - y0 + 1);
			const mean = areaSum(sum, width, x0, y0, x1, y1) / n;
			const meanSq = areaSum(sumSq, width, x0, y0, x1, y1) / n;
			const std = Math.sqrt(Math.max(0, meanSq - mean * mean));
			const threshold = Math.min(255, Math.max(0, mean * (1 + sauvolaK * ((std / 128) - 1))));
			mask[y * width + x] = samples[y * width + x] < threshold ? 1 : 0;
		}
	}
	return mask;
}

function measureMaskSpecksAndInk(
	binary: Uint8Array,
	width: number,
	height: number,
): { speckCount: number; validInkPixels: number } {
	const seen = new Uint8Array(width * height);
	const rim = Math.max(6, Math.round(Math.min(width, height) * 0.04));
	let speckCount = 0;
	let validInkPixels = 0;
	for (let y = rim; y < height - rim; y++) {
		for (let x = rim; x < width - rim; x++) {
			const start = y * width + x;
			if (binary[start] !== 1 || seen[start] === 1) continue;
			const pixels = floodInk(binary, seen, width, height, start);
			if (pixels.length <= 10) {
				speckCount++;
			} else if (pixels.length < width * height * 0.15) {
				validInkPixels += pixels.length;
			}
		}
	}
	return { speckCount, validInkPixels };
}

function sauvolaWindow(width: number, height: number): number {
	const raw = Math.round(Math.min(width, height) / 10);
	const odd = raw % 2 === 0 ? raw + 1 : raw;
	return Math.min(121, Math.max(31, odd));
}

function buildSummedArea(
	samples: Uint8Array,
	width: number,
	height: number,
	squared: boolean,
): Float64Array {
	const stride = width + 1;
	const sat = new Float64Array(stride * (height + 1));
	for (let y = 0; y < height; y++) {
		let row = 0;
		const rowStart = y * width;
		for (let x = 0; x < width; x++) {
			const value = samples[rowStart + x];
			row += squared ? value * value : value;
			sat[(y + 1) * stride + (x + 1)] = sat[y * stride + (x + 1)] + row;
		}
	}
	return sat;
}

function areaSum(
	sat: Float64Array,
	width: number,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
): number {
	const stride = width + 1;
	return sat[(y1 + 1) * stride + (x1 + 1)]
		- sat[y0 * stride + (x1 + 1)]
		- sat[(y1 + 1) * stride + x0]
		+ sat[y0 * stride + x0];
}

function detectLightInkOnDarkPage(gray: Uint8Array): boolean {
	const sampleStep = Math.max(1, Math.floor(gray.length / 5000));
	let sum = 0;
	let count = 0;
	for (let i = 0; i < gray.length; i += sampleStep) {
		sum += gray[i];
		count++;
	}
	const mean = sum / Math.max(1, count);
	return mean < 100;
}

function removeTinySpecks(binary: Uint8Array, width: number, height: number): void {
	const seen = new Uint8Array(width * height);
	const maxSpeckArea = 6;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const start = y * width + x;
			if (binary[start] !== 1 || seen[start] === 1) continue;
			const pixels = floodInk(binary, seen, width, height, start);
			if (pixels.length > maxSpeckArea) continue;
			for (const index of pixels) binary[index] = 0;
		}
	}
}

/**
 * Removes small erroneous dots of paper/margin noise (up to ~32px scaled by image size)
 * unless they sit near a real handwriting stroke — preserving `i`/`j` dots (above a stem)
 * and full stops / punctuation (beside the end of a word).
 */
function removeContextualNoiseDots(binary: Uint8Array, width: number, height: number): void {
	const scale = Math.max(width, height) / 1000;
	const maxDotArea = Math.max(18, Math.round(32 * scale * scale));
	const minStrokeArea = maxDotArea + 1;
	const minStrokeSpan = Math.max(7, Math.round(10 * scale));
	const proximityRadius = Math.max(18, Math.round(28 * scale));

	const seen = new Uint8Array(width * height);
	const anchorMask = new Uint8Array(width * height);
	const candidateDots: { pixels: number[]; cx: number; cy: number }[] = [];

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const start = y * width + x;
			if (binary[start] !== 1 || seen[start] === 1) continue;
			const pixels = floodInk(binary, seen, width, height, start);
			let minX = width;
			let maxX = 0;
			let minY = height;
			let maxY = 0;
			let sumX = 0;
			let sumY = 0;
			for (const index of pixels) {
				const px = index % width;
				const py = Math.floor(index / width);
				if (px < minX) minX = px;
				if (px > maxX) maxX = px;
				if (py < minY) minY = py;
				if (py > maxY) maxY = py;
				sumX += px;
				sumY += py;
			}
			const span = Math.max(maxX - minX + 1, maxY - minY + 1);
			if (pixels.length >= minStrokeArea || span >= minStrokeSpan) {
				for (const index of pixels) anchorMask[index] = 1;
			} else {
				candidateDots.push({
					pixels,
					cx: Math.round(sumX / pixels.length),
					cy: Math.round(sumY / pixels.length),
				});
			}
		}
	}

	if (candidateDots.length === 0) return;

	const anchorSat = buildSummedArea(anchorMask, width, height, false);
	for (const dot of candidateDots) {
		const x0 = Math.max(0, dot.cx - proximityRadius);
		const x1 = Math.min(width - 1, dot.cx + proximityRadius);
		const y0 = Math.max(0, dot.cy - Math.round(proximityRadius * 0.65));
		const y1 = Math.min(height - 1, dot.cy + Math.round(proximityRadius * 1.15));
		const nearbyStrokePixels = areaSum(anchorSat, width, x0, y0, x1, y1);
		if (nearbyStrokePixels > 0) continue;
		for (const index of dot.pixels) binary[index] = 0;
	}
}

function bridgeSinglePixelGaps(binary: Uint8Array, width: number, height: number): void {
	const additions: number[] = [];
	for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
			const index = y * width + x;
			if (binary[index] === 1) continue;
			const leftAndRight = binary[index - 1] === 1 && binary[index + 1] === 1;
			const aboveAndBelow = binary[index - width] === 1 && binary[index + width] === 1;
			if (leftAndRight || aboveAndBelow) additions.push(index);
		}
	}
	for (const index of additions) binary[index] = 1;
}

/**
 * Fills a 1px diagonal break in a thin stroke. Skips pixels that already
 * have a cardinal neighbour, so the inside of a loop is not painted shut.
 */
function bridgeDiagonalThinGaps(binary: Uint8Array, width: number, height: number): void {
	const additions: number[] = [];
	for (let y = 1; y < height - 1; y++) {
		const row = y * width;
		for (let x = 1; x < width - 1; x++) {
			const index = row + x;
			if (binary[index] === 1) continue;
			const hasCardinal = binary[index - 1] === 1
				|| binary[index + 1] === 1
				|| binary[index - width] === 1
				|| binary[index + width] === 1;
			if (hasCardinal) continue;
			const northWest = binary[index - width - 1] === 1;
			const northEast = binary[index - width + 1] === 1;
			const southWest = binary[index + width - 1] === 1;
			const southEast = binary[index + width + 1] === 1;
			const mainDiagonal = northWest && southEast && !northEast && !southWest;
			const antiDiagonal = northEast && southWest && !northWest && !southEast;
			if (mainDiagonal || antiDiagonal) additions.push(index);
		}
	}
	for (const index of additions) binary[index] = 1;
}

function removeLongStraightRules(binary: Uint8Array, width: number, height: number): void {
	const minHorizontal = Math.floor(width * 0.55);
	for (let y = 1; y < height - 1; y++) {
		let runStart = -1;
		for (let x = 0; x <= width; x++) {
			const ink = x < width && binary[y * width + x] === 1;
			if (ink && runStart < 0) runStart = x;
			if (!ink && runStart >= 0) {
				const runEnd = x - 1;
				if (runEnd - runStart + 1 >= minHorizontal && isMostlyThinHorizontal(binary, width, height, y, runStart, runEnd)) {
					for (let xx = runStart; xx <= runEnd; xx++) binary[y * width + xx] = 0;
				}
				runStart = -1;
			}
		}
	}
	const minVertical = Math.floor(height * 0.55);
	for (let x = 1; x < width - 1; x++) {
		let runStart = -1;
		for (let y = 0; y <= height; y++) {
			const ink = y < height && binary[y * width + x] === 1;
			if (ink && runStart < 0) runStart = y;
			if (!ink && runStart >= 0) {
				const runEnd = y - 1;
				if (runEnd - runStart + 1 >= minVertical && isMostlyThinVertical(binary, width, height, x, runStart, runEnd)) {
					for (let yy = runStart; yy <= runEnd; yy++) binary[yy * width + x] = 0;
				}
				runStart = -1;
			}
		}
	}
}

function isMostlyThinHorizontal(
	binary: Uint8Array,
	width: number,
	height: number,
	y: number,
	x0: number,
	x1: number,
): boolean {
	let thick = 0;
	const length = x1 - x0 + 1;
	for (let x = x0; x <= x1; x++) {
		const above = y > 0 && binary[(y - 1) * width + x] === 1;
		const below = y < height - 1 && binary[(y + 1) * width + x] === 1;
		if (above || below) thick++;
	}
	return thick / length < 0.25;
}

function isMostlyThinVertical(
	binary: Uint8Array,
	width: number,
	height: number,
	x: number,
	y0: number,
	y1: number,
): boolean {
	let thick = 0;
	const length = y1 - y0 + 1;
	for (let y = y0; y <= y1; y++) {
		const left = x > 0 && binary[y * width + (x - 1)] === 1;
		const right = x < width - 1 && binary[y * width + (x + 1)] === 1;
		if (left || right) thick++;
	}
	return thick / length < 0.25;
}

function dropLargeBorderComponents(binary: Uint8Array, width: number, height: number): void {
	const seen = new Uint8Array(width * height);
	const rim = Math.max(6, Math.round(Math.min(width, height) * 0.04));
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const start = y * width + x;
			if (binary[start] !== 1 || seen[start] === 1) continue;
			const pixels = floodInk(binary, seen, width, height, start);
			let touchesBorder = false;
			let rimCount = 0;
			for (const index of pixels) {
				const px = index % width;
				const py = Math.floor(index / width);
				const onBorder = px === 0 || py === 0 || px === width - 1 || py === height - 1;
				if (onBorder) touchesBorder = true;
				const nearEdge = px < rim || py < rim || px >= width - rim || py >= height - rim;
				if (nearEdge) rimCount++;
			}
			// A finger or torn edge sits on the rim. A word that merely touches a corner
			// has most of its pixels inside the page, so it stays.
			const hugsRim = rimCount / pixels.length > 0.45;
			const isEdgeArtifact = touchesBorder && hugsRim && pixels.length > 40;
			if (!isEdgeArtifact) continue;
			for (const index of pixels) binary[index] = 0;
		}
	}
}

function floodInk(
	binary: Uint8Array,
	seen: Uint8Array,
	width: number,
	height: number,
	start: number,
): number[] {
	const pixels: number[] = [];
	const stack = [start];
	seen[start] = 1;
	while (stack.length > 0) {
		const index = stack.pop();
		if (index === undefined) break;
		pixels.push(index);
		const px = index % width;
		const py = Math.floor(index / width);
		for (let dy = -1; dy <= 1; dy++) {
			const ny = py + dy;
			if (ny < 0 || ny >= height) continue;
			for (let dx = -1; dx <= 1; dx++) {
				if (dx === 0 && dy === 0) continue;
				const nx = px + dx;
				if (nx < 0 || nx >= width) continue;
				const next = ny * width + nx;
				if (binary[next] !== 1 || seen[next] === 1) continue;
				seen[next] = 1;
				stack.push(next);
			}
		}
	}
	return pixels;
}

/** Convert path must set this to WASM. JS thinning is a compile/test reference only. */
let zhangSuenThinImpl: (binary: Uint8Array, width: number, height: number) => Uint8Array = () => {
	throw new Error('Zhang–Suen WASM is not loaded');
};

/** Worker calls this after instantiating skeleton.wasm so convert never thins on JS. */
export function setZhangSuenThinImpl(
	impl: (binary: Uint8Array, width: number, height: number) => Uint8Array,
): void {
	zhangSuenThinImpl = impl;
}

/** JS Zhang–Suen for tests and the AssemblyScript reference. Not used on convert. */
export function zhangSuenThinJs(binary: Uint8Array, width: number, height: number): Uint8Array {
	const work = new Uint8Array(binary);
	let changed = true;
	while (changed) {
		changed = false;
		const toRemove: number[] = [];
		for (let y = 1; y < height - 1; y++) {
			for (let x = 1; x < width - 1; x++) {
				const i = y * width + x;
				if (work[i] === 0) continue;
				const p = neighbours(work, width, x, y);
				const B = p.filter((v) => v === 1).length;
				const A = transitions(p);
				if (B >= 2 && B <= 6 && A === 1) {
					if (p[0] * p[2] * p[4] === 0 && p[2] * p[4] * p[6] === 0) {
						toRemove.push(i);
					}
				}
			}
		}
		for (const i of toRemove) {
			work[i] = 0;
			changed = true;
		}
		toRemove.length = 0;
		for (let y = 1; y < height - 1; y++) {
			for (let x = 1; x < width - 1; x++) {
				const i = y * width + x;
				if (work[i] === 0) continue;
				const p = neighbours(work, width, x, y);
				const B = p.filter((v) => v === 1).length;
				const A = transitions(p);
				if (B >= 2 && B <= 6 && A === 1) {
					if (p[0] * p[2] * p[6] === 0 && p[0] * p[4] * p[6] === 0) {
						toRemove.push(i);
					}
				}
			}
		}
		for (const i of toRemove) {
			work[i] = 0;
			changed = true;
		}
	}
	return work;
}

function neighbours(work: Uint8Array, width: number, x: number, y: number): number[] {
	const idx = (yy: number, xx: number) => work[yy * width + xx];
	return [
		idx(y - 1, x),
		idx(y - 1, x + 1),
		idx(y, x + 1),
		idx(y + 1, x + 1),
		idx(y + 1, x),
		idx(y + 1, x - 1),
		idx(y, x - 1),
		idx(y - 1, x - 1),
	];
}

function transitions(p: number[]): number {
	let a = 0;
	for (let i = 0; i < 8; i++) {
		const cur = p[i] === 0 ? 0 : 1;
		const next = p[(i + 1) % 8] === 0 ? 0 : 1;
		if (cur === 0 && next === 1) a++;
	}
	return a;
}

const SKELETON_NEIGHBOR_OFFSETS: [number, number][] = [
	[-1, -1], [0, -1], [1, -1],
	[-1, 0], [1, 0],
	[-1, 1], [0, 1], [1, 1],
];

interface TracedPolyline {
	points: [number, number][];
	/** Isolated 1–2px skeleton (i-dots, periods). Kept even when shorter than the length filter. */
	isDot: boolean;
}

interface SkeletonChain {
	points: [number, number][];
	/** -1 when this end is a free endpoint rather than a junction centroid. */
	startCluster: number;
	endCluster: number;
}

const JUNCTION_PAIR_MIN_DOT = 0.65;
const STITCH_MAX_GAP = 4;
const STITCH_MIN_DOT = 0.5;
const STITCH_CELL = 4;

/**
 * Turns a skeleton into strokes. Junction pixels are clustered so a crossing
 * stays one point, branches pair by heading, and short isolated components
 * stay as dots instead of being dropped as 2px bridges.
 */
function traceSkeletonPolylines(
	skeleton: Uint8Array,
	width: number,
	height: number,
): TracedPolyline[] {
	const degree = new Uint8Array(width * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = y * width + x;
			if (skeleton[index] !== 1) continue;
			degree[index] = skeletonNeighbors(skeleton, width, height, x, y).length;
		}
	}

	const clusterOf = new Int32Array(width * height);
	clusterOf.fill(-1);
	const centroids: [number, number][] = [];
	const clusterPixels: number[][] = [];
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = y * width + x;
			if (skeleton[index] !== 1 || degree[index] < 3 || clusterOf[index] >= 0) continue;
			const pixels = floodJunctionCluster(skeleton, degree, clusterOf, width, height, index);
			let sumX = 0;
			let sumY = 0;
			const cluster = centroids.length;
			for (const pixel of pixels) {
				clusterOf[pixel] = cluster;
				sumX += pixel % width;
				sumY += Math.floor(pixel / width);
			}
			centroids.push([sumX / pixels.length, sumY / pixels.length]);
			clusterPixels.push(pixels);
		}
	}

	const consumed = new Uint8Array(width * height);
	const chains: SkeletonChain[] = [];
	for (let cluster = 0; cluster < centroids.length; cluster++) {
		const centroid = centroids[cluster];
		for (const pixel of clusterPixels[cluster]) {
			const x = pixel % width;
			const y = Math.floor(pixel / width);
			for (const [nextX, nextY] of skeletonNeighbors(skeleton, width, height, x, y)) {
				const nextIndex = nextY * width + nextX;
				if (clusterOf[nextIndex] >= 0 || consumed[nextIndex] === 1) continue;
				const walked = walkAwayFromJunction(
					skeleton,
					clusterOf,
					degree,
					consumed,
					width,
					height,
					nextX,
					nextY,
					x,
					y,
					cluster,
				);
				const points: [number, number][] = [centroid, ...walked.points];
				if (walked.endCluster >= 0) points.push(centroids[walked.endCluster]);
				if (points.length < 2) continue;
				chains.push({
					points,
					startCluster: cluster,
					endCluster: walked.endCluster,
				});
			}
		}
	}

	const dots: TracedPolyline[] = [];
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = y * width + x;
			if (skeleton[index] !== 1 || consumed[index] === 1 || clusterOf[index] >= 0) continue;
			if (degree[index] === 0) {
				consumed[index] = 1;
				dots.push({ points: [[x - 0.6, y], [x + 0.6, y]], isDot: true });
				continue;
			}
			if (degree[index] !== 1 && degree[index] !== 2) continue;
			const line = walkFreeSkeleton(skeleton, clusterOf, degree, consumed, width, height, x, y);
			if (!line || line.length < 2) continue;
			// A 1–2px component is a dot or period, not a stroke to stitch into a neighbour.
			if (line.length <= 2) {
				dots.push({ points: line, isDot: true });
				continue;
			}
			chains.push({ points: line, startCluster: -1, endCluster: -1 });
		}
	}

	const routed = routeChainsThroughJunctions(chains, centroids);
	const stitched = stitchPolylines(routed.map((chain) => chain.points));
	const traced: TracedPolyline[] = stitched.map((points) => ({ points, isDot: false }));
	return traced.concat(dots);
}

function floodJunctionCluster(
	skeleton: Uint8Array,
	degree: Uint8Array,
	clusterOf: Int32Array,
	width: number,
	height: number,
	start: number,
): number[] {
	const pixels: number[] = [];
	const stack = [start];
	clusterOf[start] = -2;
	while (stack.length > 0) {
		const index = stack.pop();
		if (index === undefined) break;
		pixels.push(index);
		const x = index % width;
		const y = Math.floor(index / width);
		for (const [nx, ny] of skeletonNeighbors(skeleton, width, height, x, y)) {
			const next = ny * width + nx;
			if (degree[next] < 3 || clusterOf[next] !== -1) continue;
			clusterOf[next] = -2;
			stack.push(next);
		}
	}
	return pixels;
}

function walkAwayFromJunction(
	skeleton: Uint8Array,
	clusterOf: Int32Array,
	degree: Uint8Array,
	consumed: Uint8Array,
	width: number,
	height: number,
	startX: number,
	startY: number,
	fromX: number,
	fromY: number,
	startCluster: number,
): { points: [number, number][]; endCluster: number } {
	const points: [number, number][] = [];
	let x = startX;
	let y = startY;
	let prevX = fromX;
	let prevY = fromY;
	const maxSteps = width * height;
	for (let step = 0; step < maxSteps; step++) {
		const index = y * width + x;
		if (skeleton[index] !== 1) return { points, endCluster: -1 };
		if (clusterOf[index] >= 0) return { points, endCluster: clusterOf[index] };
		if (consumed[index] === 1) return { points, endCluster: -1 };
		consumed[index] = 1;
		points.push([x, y]);
		if (degree[index] <= 1) return { points, endCluster: -1 };
		let foundX = -1;
		let foundY = -1;
		// First step out of a multi-pixel junction can still border another pixel of the
		// same cluster; prefer the non-cluster continuation before stopping at a cluster.
		for (const [nx, ny] of skeletonNeighbors(skeleton, width, height, x, y)) {
			if (nx === prevX && ny === prevY) continue;
			const neighborCluster = clusterOf[ny * width + nx];
			if (step === 0 && neighborCluster === startCluster) continue;
			foundX = nx;
			foundY = ny;
			if (neighborCluster < 0) break;
		}
		if (foundX < 0) return { points, endCluster: -1 };
		prevX = x;
		prevY = y;
		x = foundX;
		y = foundY;
	}
	return { points, endCluster: -1 };
}

function walkFreeSkeleton(
	skeleton: Uint8Array,
	clusterOf: Int32Array,
	degree: Uint8Array,
	consumed: Uint8Array,
	width: number,
	height: number,
	startX: number,
	startY: number,
): [number, number][] | null {
	const neighbors = skeletonNeighbors(skeleton, width, height, startX, startY);
	if (neighbors.length === 0) {
		consumed[startY * width + startX] = 1;
		return [[startX, startY], [startX + 0.6, startY]];
	}
	const points: [number, number][] = [[startX, startY]];
	consumed[startY * width + startX] = 1;
	let prevX = startX;
	let prevY = startY;
	let x = neighbors[0][0];
	let y = neighbors[0][1];
	const maxSteps = width * height;
	for (let step = 0; step < maxSteps; step++) {
		if (x === startX && y === startY) break;
		const index = y * width + x;
		if (skeleton[index] !== 1 || clusterOf[index] >= 0 || consumed[index] === 1) break;
		consumed[index] = 1;
		points.push([x, y]);
		if (degree[index] <= 1) break;
		let foundX = -1;
		let foundY = -1;
		for (const [nx, ny] of skeletonNeighbors(skeleton, width, height, x, y)) {
			if (nx === prevX && ny === prevY) continue;
			foundX = nx;
			foundY = ny;
			break;
		}
		if (foundX < 0) break;
		prevX = x;
		prevY = y;
		x = foundX;
		y = foundY;
	}
	return points;
}

/**
 * At each junction, pair the two branches whose headings best continue a stroke.
 * A score of 1 is a straight line through the crossing. Below 0.65 the branch stays its own stroke.
 */
function routeChainsThroughJunctions(
	chains: SkeletonChain[],
	centroids: [number, number][],
): SkeletonChain[] {
	let current = chains;
	for (let cluster = 0; cluster < centroids.length; cluster++) {
		current = pairChainsAtCluster(current, cluster);
	}
	return current;
}

function pairChainsAtCluster(chains: SkeletonChain[], cluster: number): SkeletonChain[] {
	const incident: number[] = [];
	for (let index = 0; index < chains.length; index++) {
		const chain = chains[index];
		const touches = chain.startCluster === cluster || chain.endCluster === cluster;
		const isClosedAtCluster = chain.startCluster === cluster && chain.endCluster === cluster;
		if (touches && !isClosedAtCluster) incident.push(index);
	}
	if (incident.length < 2) return chains;

	const pairs: { a: number; b: number; score: number }[] = [];
	for (let i = 0; i < incident.length; i++) {
		const headingA = headingIntoCluster(chains[incident[i]], cluster);
		for (let j = i + 1; j < incident.length; j++) {
			const headingB = headingIntoCluster(chains[incident[j]], cluster);
			// Both headings point into the junction. Opposite headings are one stroke.
			const score = -dot(headingA, headingB);
			if (score >= JUNCTION_PAIR_MIN_DOT) {
				pairs.push({ a: incident[i], b: incident[j], score });
			}
		}
	}
	pairs.sort((left, right) => right.score - left.score);
	const used = new Set<number>();
	const merged = new Map<number, SkeletonChain>();
	const dropped = new Set<number>();
	for (const pair of pairs) {
		if (used.has(pair.a) || used.has(pair.b)) continue;
		used.add(pair.a);
		used.add(pair.b);
		dropped.add(pair.b);
		merged.set(pair.a, mergeChainsAtCluster(chains[pair.a], chains[pair.b], cluster));
	}
	const next: SkeletonChain[] = [];
	for (let index = 0; index < chains.length; index++) {
		if (dropped.has(index)) continue;
		next.push(merged.get(index) ?? chains[index]);
	}
	return next;
}

function headingIntoCluster(chain: SkeletonChain, cluster: number): [number, number] {
	const points = chain.endCluster === cluster ? chain.points : [...chain.points].reverse();
	return tangentTowardEnd(points);
}

function mergeChainsAtCluster(a: SkeletonChain, b: SkeletonChain, cluster: number): SkeletonChain {
	const endOriented = orientClusterToEnd(a, cluster);
	const startOriented = orientClusterToEnd(b, cluster);
	const reversedStart = [...startOriented.points].reverse();
	return {
		points: endOriented.points.slice(0, -1).concat(reversedStart),
		startCluster: endOriented.otherCluster,
		endCluster: startOriented.otherCluster,
	};
}

function orientClusterToEnd(
	chain: SkeletonChain,
	cluster: number,
): { points: [number, number][]; otherCluster: number } {
	if (chain.endCluster === cluster) {
		return { points: chain.points, otherCluster: chain.startCluster };
	}
	return { points: [...chain.points].reverse(), otherCluster: chain.endCluster };
}

function skeletonNeighbors(
	skeleton: Uint8Array,
	width: number,
	height: number,
	x: number,
	y: number,
): [number, number][] {
	const found: [number, number][] = [];
	for (const [dx, dy] of SKELETON_NEIGHBOR_OFFSETS) {
		const nx = x + dx;
		const ny = y + dy;
		if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
		if (skeleton[ny * width + nx] === 1) found.push([nx, ny]);
	}
	return found;
}

function simplifyPolyline(points: [number, number][], epsilon: number): [number, number][] {
	if (points.length < 3) return points;
	const first = points[0];
	const last = points[points.length - 1];
	let index = -1;
	let distMax = 0;
	for (let i = 1; i < points.length - 1; i++) {
		const d = perpendicularDistance(points[i], first, last);
		if (d > distMax) {
			distMax = d;
			index = i;
		}
	}
	if (distMax > epsilon) {
		const left = simplifyPolyline(points.slice(0, index + 1), epsilon);
		const right = simplifyPolyline(points.slice(index), epsilon);
		return left.slice(0, -1).concat(right);
	}
	return [first, last];
}

function perpendicularDistance(
	p: [number, number],
	a: [number, number],
	b: [number, number],
): number {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	if (dx === 0 && dy === 0) {
		return Math.hypot(p[0] - a[0], p[1] - a[1]);
	}
	const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
	const projX = a[0] + t * dx;
	const projY = a[1] + t * dy;
	return Math.hypot(p[0] - projX, p[1] - projY);
}

function polylineLength(points: [number, number][]): number {
	let len = 0;
	for (let i = 1; i < points.length; i++) {
		len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
	}
	return len;
}

function mapPolylinesToWritingPage(
	polylines: { points: [number, number][] }[],
	radius: Float32Array,
	rasterWidth: number,
	rasterHeight: number,
): { points: [number, number][]; radii: number[] }[] {
	if (polylines.length === 0) return [];
	// Use the cropped raster, not the stroke bounding box. Edge junk must not
	// become the page, or the writing shrinks into the photo's leftover shape.
	const margin = WRITING_PAGE_WIDTH * 0.05;
	const contentWidth = WRITING_PAGE_WIDTH - margin * 2;
	const scale = Math.min(contentWidth / Math.max(1, rasterWidth), contentWidth / Math.max(1, rasterHeight));
	const offsetX = margin + (contentWidth - rasterWidth * scale) / 2;
	const offsetY = margin;
	const mapped: { points: [number, number][]; radii: number[] }[] = [];
	for (const line of polylines) {
		const points: [number, number][] = [];
		const radii: number[] = [];
		for (const [x, y] of line.points) {
			const px = Math.min(rasterWidth - 1, Math.max(0, Math.round(x)));
			const py = Math.min(rasterHeight - 1, Math.max(0, Math.round(y)));
			points.push([
				x * scale + offsetX,
				y * scale + offsetY,
			]);
			radii.push(radius[py * rasterWidth + px] * scale);
		}
		mapped.push({ points, radii });
	}
	return mapped;
}

/**
 * Distance from each ink pixel to the nearest paper pixel.
 * Two Chamfer passes replace a full-frame queue so a page stays under a few milliseconds
 * and the radius can sit between integer pixels.
 */
function inkRadiusMap(binary: Uint8Array, width: number, height: number): Float32Array {
	const dist = new Float32Array(width * height);
	const diagonal = 1.41421356;
	for (let index = 0; index < binary.length; index++) {
		dist[index] = binary[index] === 0 ? 0 : 1e6;
	}
	for (let y = 0; y < height; y++) {
		const row = y * width;
		for (let x = 0; x < width; x++) {
			const index = row + x;
			let best = dist[index];
			if (x > 0) best = Math.min(best, dist[index - 1] + 1);
			if (y > 0) best = Math.min(best, dist[index - width] + 1);
			if (x > 0 && y > 0) best = Math.min(best, dist[index - width - 1] + diagonal);
			if (x + 1 < width && y > 0) best = Math.min(best, dist[index - width + 1] + diagonal);
			dist[index] = best;
		}
	}
	for (let y = height - 1; y >= 0; y--) {
		const row = y * width;
		for (let x = width - 1; x >= 0; x--) {
			const index = row + x;
			let best = dist[index];
			if (x + 1 < width) best = Math.min(best, dist[index + 1] + 1);
			if (y + 1 < height) best = Math.min(best, dist[index + width] + 1);
			if (x + 1 < width && y + 1 < height) best = Math.min(best, dist[index + width + 1] + diagonal);
			if (x > 0 && y + 1 < height) best = Math.min(best, dist[index + width - 1] + diagonal);
			// Chamfer distance to the first background pixel is 1.0 even for a 1px stroke
			// (true half-width 0.5px). Subtract 0.45 so the centreline radius matches the
			// actual half-width of the Sauvola mask instead of inflating strokes by +1px.
			dist[index] = best > 0 ? Math.max(0.45, best - 0.45) : 0;
		}
	}
	return dist;
}

/** One light 3-point average so a pixel staircase is softened without shrinking small letter loops. */
function smoothPolyline(points: [number, number][]): [number, number][] {
	if (points.length < 3) return points;
	const closed = distance(points[0], points[points.length - 1]) <= 1.5;
	if (closed) {
		const ring = points.slice(0, -1);
		const count = ring.length;
		if (count < 3) return points;
		const smoothed: [number, number][] = [];
		for (let index = 0; index < count; index++) {
			const prev = ring[(index - 1 + count) % count];
			const point = ring[index];
			const next = ring[(index + 1) % count];
			smoothed.push([
				prev[0] * 0.2 + point[0] * 0.6 + next[0] * 0.2,
				prev[1] * 0.2 + point[1] * 0.6 + next[1] * 0.2,
			]);
		}
		smoothed.push([smoothed[0][0], smoothed[0][1]]);
		return smoothed;
	}
	const smoothed: [number, number][] = [points[0]];
	for (let index = 1; index < points.length - 1; index++) {
		const prev = points[index - 1];
		const point = points[index];
		const next = points[index + 1];
		smoothed.push([
			prev[0] * 0.2 + point[0] * 0.6 + next[0] * 0.2,
			prev[1] * 0.2 + point[1] * 0.6 + next[1] * 0.2,
		]);
	}
	smoothed.push(points[points.length - 1]);
	return smoothed;
}

/** Five-point average so pen width does not jump between neighbouring skeleton pixels. */
function smoothRadii(radii: number[]): number[] {
	if (radii.length < 3) return radii;
	const smoothed = radii.slice();
	for (let index = 0; index < radii.length; index++) {
		let sum = 0;
		let count = 0;
		for (let delta = -2; delta <= 2; delta++) {
			const sample = index + delta;
			if (sample < 0 || sample >= radii.length) continue;
			sum += radii[sample];
			count++;
		}
		smoothed[index] = sum / count;
	}
	return smoothed;
}

function polylineHugsRasterBorder(
	line: [number, number][],
	width: number,
	height: number,
): boolean {
	if (line.length < 8) return false;
	const rim = Math.max(5, Math.min(width, height) * 0.035);
	let near = 0;
	for (const [x, y] of line) {
		if (x <= rim || y <= rim || x >= width - rim || y >= height - rim) near++;
	}
	const longEnough = polylineLength(line) >= Math.min(width, height) * 0.22;
	return longEnough && near / line.length > 0.6;
}

/**
 * Joins chain ends that sit within a few pixels and share a heading.
 * Candidates are scored once and applied best-first, so a crossing is not
 * welded to whichever fragment the raster scan happened to see first.
 */
function stitchPolylines(lines: [number, number][][]): [number, number][][] {
	const pieces = lines
		.filter((line) => line.length >= 2)
		.map((points) => points.slice());
	const link: number[][] = pieces.map(() => [-1, -1]);
	const linkSide: number[][] = pieces.map(() => [-1, -1]);
	const grid = new Map<string, { piece: number; side: number }[]>();
	const cellKey = (x: number, y: number) => `${Math.floor(x / STITCH_CELL)},${Math.floor(y / STITCH_CELL)}`;
	for (let piece = 0; piece < pieces.length; piece++) {
		for (const side of [0, 1]) {
			const point = pieceEndpoint(pieces[piece], side);
			const key = cellKey(point[0], point[1]);
			const bucket = grid.get(key);
			const end = { piece, side };
			if (bucket) bucket.push(end);
			else grid.set(key, [end]);
		}
	}

	const candidates: { aPiece: number; aSide: number; bPiece: number; bSide: number; score: number; gap: number }[] = [];
	const seen = new Set<string>();
	for (let piece = 0; piece < pieces.length; piece++) {
		for (const side of [0, 1]) {
			const point = pieceEndpoint(pieces[piece], side);
			const heading = pieceHeadingOut(pieces[piece], side);
			const cellX = Math.floor(point[0] / STITCH_CELL);
			const cellY = Math.floor(point[1] / STITCH_CELL);
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const bucket = grid.get(`${cellX + dx},${cellY + dy}`);
					if (!bucket) continue;
					for (const other of bucket) {
						if (other.piece === piece && other.side === side) continue;
						const pairKey = stitchPairKey(piece, side, other.piece, other.side);
						if (seen.has(pairKey)) continue;
						seen.add(pairKey);
						const otherPoint = pieceEndpoint(pieces[other.piece], other.side);
						const gap = distance(point, otherPoint);
						if (gap > STITCH_MAX_GAP) continue;
						const otherHeading = pieceHeadingOut(pieces[other.piece], other.side);
						const score = -dot(heading, otherHeading);
						if (score < STITCH_MIN_DOT) continue;
						candidates.push({
							aPiece: piece,
							aSide: side,
							bPiece: other.piece,
							bSide: other.side,
							score,
							gap,
						});
					}
				}
			}
		}
	}
	candidates.sort((left, right) => right.score - left.score || left.gap - right.gap);
	for (const candidate of candidates) {
		if (link[candidate.aPiece][candidate.aSide] >= 0 || link[candidate.bPiece][candidate.bSide] >= 0) continue;
		link[candidate.aPiece][candidate.aSide] = candidate.bPiece;
		linkSide[candidate.aPiece][candidate.aSide] = candidate.bSide;
		link[candidate.bPiece][candidate.bSide] = candidate.aPiece;
		linkSide[candidate.bPiece][candidate.bSide] = candidate.aSide;
	}
	return emitStitchedPieces(pieces, link, linkSide);
}

function stitchPairKey(aPiece: number, aSide: number, bPiece: number, bSide: number): string {
	const a = `${aPiece}:${aSide}`;
	const b = `${bPiece}:${bSide}`;
	return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function pieceEndpoint(points: [number, number][], side: number): [number, number] {
	return side === 0 ? points[0] : points[points.length - 1];
}

function pieceHeadingOut(points: [number, number][], side: number): [number, number] {
	if (side === 0) return scale(tangentFromStart(points), -1);
	return tangentTowardEnd(points);
}

function stepStitchLink(
	link: number[][],
	linkSide: number[][],
	piece: number,
	side: number,
): { piece: number; side: number } | null {
	const nextPiece = link[piece][side];
	if (nextPiece < 0) return null;
	return { piece: nextPiece, side: linkSide[piece][side] };
}

function emitStitchedPieces(
	pieces: [number, number][][],
	link: number[][],
	linkSide: number[][],
): [number, number][][] {
	const visited = new Uint8Array(pieces.length);
	const result: [number, number][][] = [];
	for (let index = 0; index < pieces.length; index++) {
		if (visited[index] === 1) continue;
		let piece = index;
		let departSide = 0;
		const guard = new Set<number>();
		let cycled = false;
		while (!guard.has(piece)) {
			guard.add(piece);
			const next = stepStitchLink(link, linkSide, piece, departSide);
			if (!next) break;
			if (next.piece === index) {
				cycled = true;
				break;
			}
			piece = next.piece;
			departSide = next.side === 0 ? 1 : 0;
		}
		// departSide is the free tail, or the side that steps back to the start of a loop.
		// Entering there walks into the piece and out through the rest of the chain.
		let entrySide = departSide;
		const points: [number, number][] = [];
		const loopStart = piece;
		let first = true;
		while (piece >= 0 && visited[piece] === 0 && (first || piece !== loopStart)) {
			first = false;
			visited[piece] = 1;
			const ordered = entrySide === 0 ? pieces[piece] : [...pieces[piece]].reverse();
			appendPolyline(points, ordered);
			const exitSide = entrySide === 0 ? 1 : 0;
			const next = stepStitchLink(link, linkSide, piece, exitSide);
			if (!next || next.piece === loopStart) break;
			piece = next.piece;
			entrySide = next.side;
		}
		if (cycled && points.length >= 3 && distance(points[0], points[points.length - 1]) > 0.75) {
			points.push([points[0][0], points[0][1]]);
		}
		if (points.length >= 2) result.push(points);
	}
	return result;
}

function appendPolyline(target: [number, number][], extra: [number, number][]): void {
	let start = 0;
	if (target.length > 0 && extra.length > 0 && distance(target[target.length - 1], extra[0]) <= 0.75) {
		start = 1;
	}
	for (let index = start; index < extra.length; index++) target.push(extra[index]);
}

function tangentFromStart(line: [number, number][]): [number, number] {
	const look = Math.min(line.length - 1, 4);
	return unit(line[look][0] - line[0][0], line[look][1] - line[0][1]);
}

function tangentTowardEnd(line: [number, number][]): [number, number] {
	const look = Math.max(0, line.length - 5);
	const last = line[line.length - 1];
	return unit(last[0] - line[look][0], last[1] - line[look][1]);
}

function unit(dx: number, dy: number): [number, number] {
	const length = Math.hypot(dx, dy) || 1;
	return [dx / length, dy / length];
}

function scale(vector: [number, number], amount: number): [number, number] {
	return [vector[0] * amount, vector[1] * amount];
}

function distance(a: [number, number], b: [number, number]): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function dot(a: [number, number], b: [number, number]): number {
	return a[0] * b[0] + a[1] * b[1];
}

function polylineToInkStroke(points: [number, number][], radii: number[]): InkStroke {
	let radiusSum = 0;
	for (const radius of radii) radiusSum += radius;
	const meanRadius = radiusSum / Math.max(1, radii.length);
	// Diameter is 2 * radius. Keep a modest ceiling so bold markers stay bold without
	// inflating normal handwriting strokes past their preview mask width.
	const size = Math.min(16, Math.max(1.8, meanRadius * 1.85));
	const inkPoints: InkPoint[] = [];
	for (let index = 0; index < points.length; index++) {
		const radius = radii[index] ?? meanRadius;
		const pressure = Math.min(0.85, Math.max(0.22, (radius / Math.max(0.5, size / 2)) * 0.5));
		inkPoints.push([points[index][0], points[index][1], pressure]);
	}
	const now = Date.now();
	return {
		id: nanoid(),
		points: inkPoints,
		style: {
			...DEFAULT_STROKE_STYLE,
			size,
			thinning: 0.18,
			smoothing: 0.35,
			// Traced coordinates are already smoothed and simplified; high streamline
			// pulls perfect-freehand inside tight letter turns ('e', 'o', 'v', 'k').
			streamline: 0.12,
			// Real thickness from the photo. Velocity simulation would taper the dashes.
			simulatePressure: false,
			inputKind: 'pen',
		},
		offset: { x: 0, y: 0 },
		startedAt: now,
		finishedAt: now,
		authoringSource: 'local',
	};
}
