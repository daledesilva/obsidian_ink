import type { PagePoint } from './find-page-quad';

//////////
//////////

/** One side of the quad. Corners run around the page, so neighbours share an edge. */
export interface CropEdge {
	startIndex: number;
	endIndex: number;
}

/** Sides of the quad in corner order. */
export const CROP_EDGES: CropEdge[] = [
	{ startIndex: 0, endIndex: 1 },
	{ startIndex: 1, endIndex: 2 },
	{ startIndex: 2, endIndex: 3 },
	{ startIndex: 3, endIndex: 0 },
];

/** How close a press must be to a side, in screen pixels, to drag that side. */
export const CROP_EDGE_HIT_SCREEN_PX = 28;
/** Presses this close to a circle grab that circle instead of the side. */
export const CROP_CORNER_EXCLUSION_SCREEN_PX = 24;

/** Maps any integer quarter-turn count onto 0–3 clockwise steps. */
export function normalizeQuarterTurns(quarterTurnsClockwise: number): number {
	const turns = quarterTurnsClockwise % 4;
	if (turns < 0) return turns + 4;
	return turns;
}

export function clampCropValue(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * The side under the press, if it is close to the line and not beside either circle.
 * Ends are left out so a press next to a circle jumps that circle instead of sliding the side.
 */
export function hitCropEdge(
	point: PagePoint,
	corners: [PagePoint, PagePoint, PagePoint, PagePoint],
	edgeThreshold: number,
	cornerExclusion: number,
): CropEdge | null {
	let closestEdge: CropEdge | null = null;
	let closestDistance = Infinity;
	for (const edge of CROP_EDGES) {
		const start = corners[edge.startIndex];
		const end = corners[edge.endIndex];
		const distance = distancePointToSegment(point, start, end);
		if (distance > edgeThreshold) continue;
		const distanceFromStart = Math.hypot(point.x - start.x, point.y - start.y);
		const distanceFromEnd = Math.hypot(point.x - end.x, point.y - end.y);
		const isBesideACorner = distanceFromStart <= cornerExclusion || distanceFromEnd <= cornerExclusion;
		if (isBesideACorner) continue;
		if (distance >= closestDistance) continue;
		closestDistance = distance;
		closestEdge = edge;
	}
	return closestEdge;
}

/** Index of the pin nearest the press. The first pin wins a tie. */
export function nearestCornerIndex(
	point: PagePoint,
	corners: [PagePoint, PagePoint, PagePoint, PagePoint],
): number {
	let closestIndex = 0;
	let closestDistance = Infinity;
	for (let index = 0; index < corners.length; index++) {
		const distance = Math.hypot(point.x - corners[index].x, point.y - corners[index].y);
		if (distance >= closestDistance) continue;
		closestDistance = distance;
		closestIndex = index;
	}
	return closestIndex;
}

/** Shortest distance from a point to a segment, in the same units as the points. */
export function distancePointToSegment(point: PagePoint, start: PagePoint, end: PagePoint): number {
	const spanX = end.x - start.x;
	const spanY = end.y - start.y;
	const spanLengthSquared = spanX * spanX + spanY * spanY;
	if (spanLengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
	let along = ((point.x - start.x) * spanX + (point.y - start.y) * spanY) / spanLengthSquared;
	if (along < 0) along = 0;
	if (along > 1) along = 1;
	const closestX = start.x + along * spanX;
	const closestY = start.y + along * spanY;
	return Math.hypot(point.x - closestX, point.y - closestY);
}

/**
 * Largest shared slide that keeps both corners inside the photo.
 * Both ends get this same delta, so the side keeps its length and angle.
 */
export function clampSharedCornerDelta(
	start: PagePoint,
	end: PagePoint,
	deltaX: number,
	deltaY: number,
	imageWidth: number,
	imageHeight: number,
): { dx: number; dy: number } {
	const minDeltaX = Math.max(-start.x, -end.x);
	const maxDeltaX = Math.min(imageWidth - start.x, imageWidth - end.x);
	const minDeltaY = Math.max(-start.y, -end.y);
	const maxDeltaY = Math.min(imageHeight - start.y, imageHeight - end.y);
	return {
		dx: clampCropValue(deltaX, minDeltaX, maxDeltaX),
		dy: clampCropValue(deltaY, minDeltaY, maxDeltaY),
	};
}

/**
 * Largest stage that keeps the photo's aspect ratio inside the dialog.
 * reservedHeight leaves room for the title, the controls, and padding.
 */
export function fitPhotoStage(
	imageWidth: number,
	imageHeight: number,
	viewportWidth: number,
	viewportHeight: number,
	reservedHeight = 280,
): { width: number; height: number } {
	const maxWidth = Math.max(160, Math.min(520, viewportWidth - 120));
	const maxHeight = Math.max(160, viewportHeight - reservedHeight);
	const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight, 1);
	return {
		width: Math.max(1, Math.round(imageWidth * scale)),
		height: Math.max(1, Math.round(imageHeight * scale)),
	};
}
