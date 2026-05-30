import type { Vec2 } from 'perfect-freehand';
import type { InkPoint, InkStrokeOutlineOptions } from '../types';
import {
	INK_STROKE_ZOOM_REFERENCE,
	nearDuplicateMergeThresholdSq,
} from '../stroke-zoom-scale';
import type { InkFreehandPoint, InkStrokePoint } from './types';

const DEFAULT_PRESSURE = 0.5;

const MIN_START_PRESSURE = 0.025;
const MIN_END_PRESSURE = 0.01;
const RATE_OF_PRESSURE_CHANGE = 0.275;

function hasPressure(p: number | undefined): p is number {
	return typeof p === 'number' && Number.isFinite(p) && p >= 0;
}

function dist(a: Vec2, b: Vec2): number {
	return Math.hypot(a[1] - b[1], a[0] - b[0]);
}

function distSq(a: Vec2, b: Vec2): number {
	const dx = a[0] - b[0];
	const dy = a[1] - b[1];
	return dx * dx + dy * dy;
}

function add(a: Vec2, b: Vec2): Vec2 {
	return [a[0] + b[0], a[1] + b[1]];
}

function sub(a: Vec2, b: Vec2): Vec2 {
	return [a[0] - b[0], a[1] - b[1]];
}

function mul(a: Vec2, s: number): Vec2 {
	return [a[0] * s, a[1] * s];
}

function len(a: Vec2): number {
	return Math.hypot(a[0], a[1]);
}

function unit(a: Vec2): Vec2 {
	const l = len(a);
	return l === 0 ? [0, 0] : [a[0] / l, a[1] / l];
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function smoothPressure(prev: number, next: number, distance: number, size: number): number {
	const t = Math.min(1, distance / size);
	// Same curve constant used upstream; keeps pressure changes bounded per-distance.
	return Math.min(1, prev + (Math.min(1, 1 - t) - prev) * (t * RATE_OF_PRESSURE_CHANGE) + (next - prev) * (t * RATE_OF_PRESSURE_CHANGE));
}

function coerceInkFreehandPoints(points: InkPoint[]): InkFreehandPoint[] {
	return points.map(p => [p[0], p[1], hasPressure(p[2]) ? p[2] : DEFAULT_PRESSURE]);
}

function insertTwoPointInbetweens(points: InkFreehandPoint[]): InkFreehandPoint[] {
	if (points.length !== 2) return points;
	const a = points[0];
	const b = points[1];
	const out: InkFreehandPoint[] = [a];
	for (let i = 1; i < 5; i++) {
		const t = i / 4;
		out.push([
			a[0] + (b[0] - a[0]) * t,
			a[1] + (b[1] - a[1]) * t,
			// Pressure lerp; real pressure strokes stay stable on short segments.
			a[2] + (b[2] - a[2]) * t,
		]);
	}
	return out;
}

function ensureAtLeastTwoPoints(points: InkFreehandPoint[]): InkFreehandPoint[] {
	if (points.length >= 2) return points;
	if (points.length === 0) return [];
	const p = points[0];
	return [p, [p[0] + 1, p[1] + 1, p[2]]];
}

function mergeNearDuplicatePoints(
	points: InkFreehandPoint[],
	size: number,
	captureZoom: number,
): InkFreehandPoint[] {
	if (points.length <= 1) return points;
	const threshold = nearDuplicateMergeThresholdSq(size, captureZoom);
	const out: InkFreehandPoint[] = [points[0]];
	for (let i = 1; i < points.length; i++) {
		const prev = out[out.length - 1];
		const next = points[i];
		const d2 = (next[0] - prev[0]) ** 2 + (next[1] - prev[1]) ** 2;
		if (d2 < threshold) {
			// Preserve the maximum pressure while merging; avoids thin gaps.
			out[out.length - 1] = [next[0], next[1], Math.max(prev[2], next[2])];
		} else {
			out.push(next);
		}
	}
	return out;
}

function trimLowPressureEndpoints(points: InkFreehandPoint[], options: InkStrokeOutlineOptions): InkFreehandPoint[] {
	if (points.length === 0) return points;
	if (options.simulatePressure) return points;

	let startIdx = 0;
	while (startIdx < points.length - 1 && points[startIdx][2] < MIN_START_PRESSURE) {
		startIdx++;
	}

	let endIdx = points.length - 1;
	while (endIdx > startIdx && points[endIdx][2] < MIN_END_PRESSURE) {
		endIdx--;
	}

	return points.slice(startIdx, endIdx + 1);
}

/**
 * Enhanced preprocessing stage for perfect-freehand outlines.
 * Returns StrokePoints compatible with `getStrokeOutlinePoints`.
 */
export function getInkStrokePoints(points: InkPoint[], options: InkStrokeOutlineOptions = {}): InkStrokePoint[] {
	const size = options.size ?? 16;
	const streamline = options.streamline ?? 0.5;
	const last = options.last ?? false;
	const captureZoom = options.captureZoom ?? INK_STROKE_ZOOM_REFERENCE;

	if (points.length === 0 || size <= 0) return [];

	let inkPoints = coerceInkFreehandPoints(points);
	inkPoints = insertTwoPointInbetweens(inkPoints);
	inkPoints = ensureAtLeastTwoPoints(inkPoints);

	inkPoints = mergeNearDuplicatePoints(inkPoints, size, captureZoom);
	inkPoints = trimLowPressureEndpoints(inkPoints, options);
	inkPoints = ensureAtLeastTwoPoints(inkPoints);

	const t = 0.15 + (1 - streamline) * 0.85;

	// Start with the first point; match upstream defaults.
	const first = inkPoints[0];
	const strokePoints: InkStrokePoint[] = [{
		point: [first[0], first[1]],
		pressure: hasPressure(first[2]) ? first[2] : 0.25,
		vector: [1, 1],
		distance: 0,
		runningLength: 0,
	}];

	let hasCommittedEarlyPoints = false;
	let runningLength = 0;
	let prev = strokePoints[0];
	let prevPressure = prev.pressure;

	const lastIdx = inkPoints.length - 1;
	for (let i = 1; i < inkPoints.length; i++) {
		const raw = inkPoints[i];
		const rawPoint: Vec2 = [raw[0], raw[1]];
		const nextPoint: Vec2 = (last && i === lastIdx)
			? rawPoint
			: lerp(prev.point, rawPoint, t);

		if (nextPoint[0] === prev.point[0] && nextPoint[1] === prev.point[1]) continue;

		const d = dist(nextPoint, prev.point);
		runningLength += d;

		// Minimum length before committing early points (avoids noisy starts).
		if (i < lastIdx && !hasCommittedEarlyPoints) {
			if (runningLength < size) {
				continue;
			}
			hasCommittedEarlyPoints = true;
		}

		const rawPressure = hasPressure(raw[2]) ? raw[2] : DEFAULT_PRESSURE;
		const pressure = options.simulatePressure
			? rawPressure
			: smoothPressure(prevPressure, rawPressure, d, size);

		const v = unit(sub(prev.point, nextPoint));

		const sp: InkStrokePoint = {
			point: nextPoint,
			pressure,
			vector: v,
			distance: d,
			runningLength,
		};

		strokePoints.push(sp);
		prev = sp;
		prevPressure = pressure;
	}

	// Match upstream: first vector mirrors second.
	strokePoints[0].vector = strokePoints[1]?.vector ?? [0, 0];
	return strokePoints;
}

