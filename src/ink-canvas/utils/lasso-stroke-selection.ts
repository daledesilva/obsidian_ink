import { getRenderedStrokeData } from '../rendered-stroke-cache';
import type { InkStroke } from '../types';

///////////////////////////
///////////////////////////

type Point = { x: number; y: number };

/** True when a lasso polygon should include this stroke (touch or overlap counts). */
export function strokeIntersectsLassoPolygon(stroke: InkStroke, lasso: Point[]): boolean {
	if (lasso.length < 3 || stroke.points.length === 0) return false;

	const worldPoints = stroke.points.map((point) => ({
		x: point[0] + stroke.offset.x,
		y: point[1] + stroke.offset.y,
	}));

	for (const point of worldPoints) {
		if (isPointInPolygon(point.x, point.y, lasso)) return true;
	}

	for (let i = 0; i < worldPoints.length - 1; i++) {
		if (segmentIntersectsPolygon(worldPoints[i], worldPoints[i + 1], lasso)) return true;
	}

	const rendered = getRenderedStrokeData(stroke);
	const bounds = {
		minX: rendered.bounds.minX + stroke.offset.x,
		minY: rendered.bounds.minY + stroke.offset.y,
		maxX: rendered.bounds.maxX + stroke.offset.x,
		maxY: rendered.bounds.maxY + stroke.offset.y,
	};

	return boundsIntersectsPolygon(bounds, lasso);
}

function boundsIntersectsPolygon(
	bounds: { minX: number; minY: number; maxX: number; maxY: number },
	polygon: Point[],
): boolean {
	const corners: Point[] = [
		{ x: bounds.minX, y: bounds.minY },
		{ x: bounds.maxX, y: bounds.minY },
		{ x: bounds.maxX, y: bounds.maxY },
		{ x: bounds.minX, y: bounds.maxY },
	];

	for (const corner of corners) {
		if (isPointInPolygon(corner.x, corner.y, polygon)) return true;
	}

	const bboxEdges: [Point, Point][] = [
		[corners[0], corners[1]],
		[corners[1], corners[2]],
		[corners[2], corners[3]],
		[corners[3], corners[0]],
	];

	for (const [a, b] of bboxEdges) {
		if (segmentIntersectsPolygon(a, b, polygon)) return true;
	}

	for (const vertex of polygon) {
		if (
			vertex.x >= bounds.minX
			&& vertex.x <= bounds.maxX
			&& vertex.y >= bounds.minY
			&& vertex.y <= bounds.maxY
		) {
			return true;
		}
	}

	return false;
}

function segmentIntersectsPolygon(a: Point, b: Point, polygon: Point[]): boolean {
	const n = polygon.length;
	for (let i = 0, j = n - 1; i < n; j = i++) {
		const c = polygon[j];
		const d = polygon[i];
		if (segmentsIntersect(a, b, c, d)) return true;
	}
	return false;
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
	const denominator = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
	if (denominator === 0) return false;

	const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denominator;
	const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / denominator;

	return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/** Ray-casting point-in-polygon test. */
function isPointInPolygon(x: number, y: number, polygon: Point[]): boolean {
	let inside = false;
	const n = polygon.length;
	for (let i = 0, j = n - 1; i < n; j = i++) {
		const xi = polygon[i].x;
		const yi = polygon[i].y;
		const xj = polygon[j].x;
		const yj = polygon[j].y;

		const intersect = ((yi > y) !== (yj > y))
			&& (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
		if (intersect) inside = !inside;
	}
	return inside;
}
