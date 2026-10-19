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
	/** Drop skeleton fragments shorter than this, in source pixels. */
	minPolylineLengthPx?: number;
}

/** Long-edge cap for the canvas that corners, warp, and trace read. */
export const PHOTO_TRACE_WORKING_MAX_EDGE_PX = 3200;
/** Long-edge floor when the user turns Resolution down. */
export const PHOTO_TRACE_MIN_EDGE_PX = 900;
/** Default Detail and Resolution slider positions. Higher than the old fixed trace. */
export const PHOTO_TRACE_DEFAULT_DETAIL = 85;
export const PHOTO_TRACE_DEFAULT_RESOLUTION = 85;

/**
 * Maps the Detail slider (0–100) onto how tightly polylines follow the skeleton.
 * 0 is a coarse centreline. 100 keeps almost every wiggle.
 */
export function photoTraceSimplifyEpsilon(detail: number): number {
	const unit = clampSlider(detail) / 100;
	return 4.2 - unit * 3.8;
}

/**
 * Maps the Detail slider onto the shortest stroke the tracer keeps.
 */
export function photoTraceMinPolylineLength(detail: number): number {
	const unit = clampSlider(detail) / 100;
	return Math.max(2, Math.round(16 - unit * 14));
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

const MIN_POLYLINE_POINTS = 3;
const DEFAULT_SIMPLIFY_EPSILON = photoTraceSimplifyEpsilon(PHOTO_TRACE_DEFAULT_DETAIL);
const DEFAULT_MIN_POLYLINE_LENGTH_PX = photoTraceMinPolylineLength(PHOTO_TRACE_DEFAULT_DETAIL);
const SAUVOLA_K = 0.34;
const INK_CLOSE_RADIUS = 1;

/**
 * Traces dark-or-light ink on a photo into ink-canvas stroke centreline points in page space.
 */
export function traceHandwritingFromRaster(input: PhotoTraceRasterInput): PhotoTraceResult {
	let binary = buildInkMask(input);
	// A small window outlines a thick pen instead of filling it, and thinning those
	// outlines becomes the broken dashes. Close the mask so each stroke is solid
	// before specks are dropped. An open (erode first) is avoided: it deletes the pen.
	binary = closeMask(binary, input.width, input.height, INK_CLOSE_RADIUS);
	removeTinySpecks(binary, input.width, input.height);
	bridgeSinglePixelGaps(binary, input.width, input.height);
	removeLongStraightRules(binary, input.width, input.height);
	if (input.dropLargeBorderComponents) {
		dropLargeBorderComponents(binary, input.width, input.height);
	}
	const skeleton = zhangSuenThin(binary, input.width, input.height);
	const polylines = extractPolylines(skeleton, input.width, input.height);
	const simplifyEpsilon = input.simplifyEpsilon ?? DEFAULT_SIMPLIFY_EPSILON;
	const minPolylineLengthPx = input.minPolylineLengthPx ?? DEFAULT_MIN_POLYLINE_LENGTH_PX;
	const simplified = polylines
		.map((line) => simplifyPolyline(line, simplifyEpsilon))
		.filter((line) => line.length >= MIN_POLYLINE_POINTS && polylineLength(line) >= minPolylineLengthPx);
	const mapped = mapPolylinesToWritingPage(simplified);
	const writingLineHeight = estimateWritingLineHeight(mapped, WRITING_LINE_HEIGHT);
	const strokes = mapped.map((points) => polylineToInkStroke(points));
	return { strokes, writingLineHeight };
}

function buildInkMask(input: PhotoTraceRasterInput): Uint8Array {
	const { width, height, gray } = input;
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
			const threshold = Math.min(255, Math.max(0, mean * (1 + SAUVOLA_K * ((std / 128) - 1))));
			mask[y * width + x] = samples[y * width + x] < threshold ? 1 : 0;
		}
	}
	return mask;
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

function closeMask(binary: Uint8Array, width: number, height: number, radius: number): Uint8Array {
	return erodeSquare(dilateSquare(binary, width, height, radius), width, height, radius);
}

function dilateSquare(binary: Uint8Array, width: number, height: number, radius: number): Uint8Array {
	const out = new Uint8Array(binary.length);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let on = 0;
			for (let dy = -radius; dy <= radius && on === 0; dy++) {
				const yy = y + dy;
				if (yy < 0 || yy >= height) continue;
				const row = yy * width;
				for (let dx = -radius; dx <= radius; dx++) {
					const xx = x + dx;
					if (xx < 0 || xx >= width) continue;
					if (binary[row + xx] === 1) {
						on = 1;
						break;
					}
				}
			}
			out[y * width + x] = on;
		}
	}
	return out;
}

function erodeSquare(binary: Uint8Array, width: number, height: number, radius: number): Uint8Array {
	const out = new Uint8Array(binary.length);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let on = 1;
			for (let dy = -radius; dy <= radius && on === 1; dy++) {
				const yy = y + dy;
				if (yy < 0 || yy >= height) {
					on = 0;
					break;
				}
				const row = yy * width;
				for (let dx = -radius; dx <= radius; dx++) {
					const xx = x + dx;
					if (xx < 0 || xx >= width || binary[row + xx] !== 1) {
						on = 0;
						break;
					}
				}
			}
			out[y * width + x] = on;
		}
	}
	return out;
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
	const rim = Math.max(3, Math.round(Math.min(width, height) * 0.012));
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
			const hugsRim = rimCount / pixels.length > 0.7;
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

function zhangSuenThin(binary: Uint8Array, width: number, height: number): Uint8Array {
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

function extractPolylines(skeleton: Uint8Array, width: number, height: number): [number, number][][] {
	const degree = new Uint8Array(width * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = y * width + x;
			if (skeleton[index] !== 1) continue;
			degree[index] = skeletonNeighbors(skeleton, width, height, x, y).length;
		}
	}
	const consumed = new Uint8Array(width * height);
	const lines: [number, number][][] = [];
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = y * width + x;
			if (skeleton[index] !== 1) continue;
			const pixelDegree = degree[index];
			if (pixelDegree !== 1 && pixelDegree < 3) continue;
			for (const [nextX, nextY] of skeletonNeighbors(skeleton, width, height, x, y)) {
				const nextIndex = nextY * width + nextX;
				if (degree[nextIndex] < 3 && consumed[nextIndex] === 1) continue;
				const line = walkSkeletonBranch(skeleton, degree, consumed, width, height, x, y, nextX, nextY);
				if (line) lines.push(line);
			}
		}
	}
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = y * width + x;
			if (skeleton[index] !== 1 || consumed[index] === 1 || degree[index] !== 2) continue;
			const line = walkSkeletonLoop(skeleton, consumed, width, height, x, y);
			if (line) lines.push(line);
		}
	}
	return lines;
}

function walkSkeletonBranch(
	skeleton: Uint8Array,
	degree: Uint8Array,
	consumed: Uint8Array,
	width: number,
	height: number,
	startX: number,
	startY: number,
	nextX: number,
	nextY: number,
): [number, number][] | null {
	const path: [number, number][] = [[startX, startY]];
	let prevX = startX;
	let prevY = startY;
	let x = nextX;
	let y = nextY;
	const maxSteps = width * height;
	for (let step = 0; step < maxSteps; step++) {
		const index = y * width + x;
		if (skeleton[index] !== 1) break;
		path.push([x, y]);
		const isStop = degree[index] <= 1 || degree[index] >= 3;
		if (isStop) break;
		if (consumed[index] === 1) break;
		consumed[index] = 1;
		const neighbors = skeletonNeighbors(skeleton, width, height, x, y);
		let foundX = -1;
		let foundY = -1;
		for (const [nx, ny] of neighbors) {
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
	if (path.length < MIN_POLYLINE_POINTS) return null;
	return path;
}

function walkSkeletonLoop(
	skeleton: Uint8Array,
	consumed: Uint8Array,
	width: number,
	height: number,
	startX: number,
	startY: number,
): [number, number][] | null {
	const neighbors = skeletonNeighbors(skeleton, width, height, startX, startY);
	if (neighbors.length === 0) return null;
	const path: [number, number][] = [[startX, startY]];
	consumed[startY * width + startX] = 1;
	let prevX = startX;
	let prevY = startY;
	let x = neighbors[0][0];
	let y = neighbors[0][1];
	const maxSteps = width * height;
	for (let step = 0; step < maxSteps; step++) {
		if (x === startX && y === startY) break;
		const index = y * width + x;
		if (skeleton[index] !== 1 || consumed[index] === 1) break;
		consumed[index] = 1;
		path.push([x, y]);
		const nextNeighbors = skeletonNeighbors(skeleton, width, height, x, y);
		let foundX = -1;
		let foundY = -1;
		for (const [nx, ny] of nextNeighbors) {
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
	if (path.length < MIN_POLYLINE_POINTS) return null;
	return path;
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
	polylines: [number, number][][],
): [number, number][][] {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const line of polylines) {
		for (const [x, y] of line) {
			if (x < minX) minX = x;
			if (y < minY) minY = y;
			if (x > maxX) maxX = x;
			if (y > maxY) maxY = y;
		}
	}
	if (!Number.isFinite(minX)) {
		return [];
	}
	const margin = WRITING_PAGE_WIDTH * 0.05;
	const contentWidth = WRITING_PAGE_WIDTH - margin * 2;
	const inkWidth = Math.max(1, maxX - minX);
	const inkHeight = Math.max(1, maxY - minY);
	const scale = Math.min(contentWidth / inkWidth, contentWidth / inkHeight);
	const offsetX = margin + (contentWidth - inkWidth * scale) / 2;
	const offsetY = margin;
	const mapped: [number, number][][] = [];
	for (const line of polylines) {
		const next: [number, number][] = [];
		for (const [x, y] of line) {
			next.push([
				(x - minX) * scale + offsetX,
				(y - minY) * scale + offsetY,
			]);
		}
		mapped.push(next);
	}
	return mapped;
}

function estimateWritingLineHeight(polylines: [number, number][][], fallback: number): number {
	const ySamples: number[] = [];
	for (const line of polylines) {
		if (line.length === 0) continue;
		let sumY = 0;
		for (const [, y] of line) {
			sumY += y;
		}
		ySamples.push(sumY / line.length);
	}
	ySamples.sort((a, b) => a - b);
	if (ySamples.length < 2) return fallback;
	const gaps: number[] = [];
	for (let i = 1; i < ySamples.length; i++) {
		const gap = ySamples[i] - ySamples[i - 1];
		if (gap > fallback * 0.35) {
			gaps.push(gap);
		}
	}
	if (gaps.length === 0) return fallback;
	gaps.sort((a, b) => a - b);
	const mid = Math.floor(gaps.length / 2);
	return Math.round(gaps[mid]);
}

function polylineToInkStroke(points: [number, number][]): InkStroke {
	const inkPoints: InkPoint[] = [];
	for (const [x, y] of points) {
		inkPoints.push([x, y, 0.5]);
	}
	const now = Date.now();
	return {
		id: nanoid(),
		points: inkPoints,
		style: {
			...DEFAULT_STROKE_STYLE,
			simulatePressure: true,
		},
		offset: { x: 0, y: 0 },
		startedAt: now,
		finishedAt: now,
		authoringSource: 'local',
	};
}
