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
const MAX_AREA_RATIO = 0.9;

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
 * Finds a page quadrilateral from luminance edges. Returns null when the photo
 * is already the page or no trustworthy border exists. Does not use colour.
 */
export function findPageQuad(
	gray: Uint8Array,
	width: number,
	height: number,
): PageQuad | null {
	if (width < 8 || height < 8) return null;
	const longEdge = Math.max(width, height);
	const scale = longEdge > DETECT_MAX_EDGE ? DETECT_MAX_EDGE / longEdge : 1;
	const detectWidth = Math.max(8, Math.round(width * scale));
	const detectHeight = Math.max(8, Math.round(height * scale));
	const small = downscaleGray(gray, width, height, detectWidth, detectHeight);
	const blurred = boxBlur(small, detectWidth, detectHeight);
	const edges = sobelEdges(blurred, detectWidth, detectHeight);
	const binary = thresholdEdges(edges);
	const contours = traceContours(binary, detectWidth, detectHeight);
	let best: PagePoint[] | null = null;
	let bestArea = 0;
	const frameArea = detectWidth * detectHeight;
	for (const contour of contours) {
		if (contour.length < 24) continue;
		const hull = convexHull(contour);
		const quad = approximateQuad(hull);
		if (!quad) continue;
		const area = polygonArea(quad);
		const areaRatio = area / frameArea;
		if (areaRatio < MIN_AREA_RATIO || areaRatio > MAX_AREA_RATIO) continue;
		if (!quadSidesAreSubstantial(quad, detectWidth, detectHeight)) continue;
		if (area <= bestArea) continue;
		bestArea = area;
		best = quad;
	}
	if (!best) return null;
	const scaleX = width / detectWidth;
	const scaleY = height / detectHeight;
	const scaled = best.map((point) => ({
		x: clamp(point.x * scaleX, 0, width),
		y: clamp(point.y * scaleY, 0, height),
	}));
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

function thresholdEdges(mag: Float32Array): Uint8Array {
	const samples: number[] = [];
	for (let i = 0; i < mag.length; i += 3) {
		if (mag[i] > 8) samples.push(mag[i]);
	}
	samples.sort((a, b) => a - b);
	let cutoff = 40;
	if (samples.length > 0) {
		const index = Math.min(samples.length - 1, Math.floor(samples.length * 0.9));
		cutoff = Math.max(28, samples[index]);
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

function approximateQuad(hull: PagePoint[]): PagePoint[] | null {
	if (hull.length < 4) return null;
	if (hull.length === 4) return hull;
	let epsilon = polygonPerimeter(hull) * 0.02;
	const maxEpsilon = polygonPerimeter(hull) * 0.14;
	while (epsilon <= maxEpsilon) {
		const simplified = simplifyClosed(hull, epsilon);
		if (simplified.length === 4) return simplified;
		if (simplified.length < 4) return null;
		epsilon *= 1.35;
	}
	return null;
}

function simplifyClosed(points: PagePoint[], epsilon: number): PagePoint[] {
	const open = simplifyPolyline(points, epsilon);
	if (open.length >= 2) {
		const first = open[0];
		const last = open[open.length - 1];
		if (Math.hypot(first.x - last.x, first.y - last.y) <= epsilon) {
			open.pop();
		}
	}
	return open;
}

function simplifyPolyline(points: PagePoint[], epsilon: number): PagePoint[] {
	if (points.length < 3) return points.map((point) => ({ ...point }));
	const first = points[0];
	const last = points[points.length - 1];
	let index = -1;
	let distMax = 0;
	for (let i = 1; i < points.length - 1; i++) {
		const distance = perpendicularDistance(points[i], first, last);
		if (distance > distMax) {
			distMax = distance;
			index = i;
		}
	}
	if (distMax > epsilon && index > 0) {
		const left = simplifyPolyline(points.slice(0, index + 1), epsilon);
		const right = simplifyPolyline(points.slice(index), epsilon);
		return left.slice(0, -1).concat(right);
	}
	return [{ ...first }, { ...last }];
}

function perpendicularDistance(point: PagePoint, a: PagePoint, b: PagePoint): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	if (dx === 0 && dy === 0) return Math.hypot(point.x - a.x, point.y - a.y);
	const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy);
	return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function polygonPerimeter(points: PagePoint[]): number {
	let length = 0;
	for (let i = 0; i < points.length; i++) {
		const next = points[(i + 1) % points.length];
		length += Math.hypot(next.x - points[i].x, next.y - points[i].y);
	}
	return length;
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
	const minSide = Math.min(width, height) * 0.12;
	for (let i = 0; i < quad.length; i++) {
		const next = quad[(i + 1) % quad.length];
		if (Math.hypot(next.x - quad[i].x, next.y - quad[i].y) < minSide) return false;
	}
	return true;
}

function orderQuadCorners(points: PagePoint[]): [PagePoint, PagePoint, PagePoint, PagePoint] {
	let topLeft = points[0];
	let topRight = points[0];
	let bottomRight = points[0];
	let bottomLeft = points[0];
	for (const point of points) {
		if (point.x + point.y < topLeft.x + topLeft.y) topLeft = point;
		if (point.x + point.y > bottomRight.x + bottomRight.y) bottomRight = point;
		if (point.x - point.y > topRight.x - topRight.y) topRight = point;
		if (point.y - point.x > bottomLeft.y - bottomLeft.x) bottomLeft = point;
	}
	return [
		{ ...topLeft },
		{ ...topRight },
		{ ...bottomRight },
		{ ...bottomLeft },
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
