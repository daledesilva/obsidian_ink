import type { InkPoint, InkStroke } from './types';

///////////////////////////
///////////////////////////

function cloneStroke(stroke: InkStroke): InkStroke {
	return {
		...stroke,
		points: stroke.points.map((point) => [...point] as InkPoint),
		style: { ...stroke.style },
		offset: { x: stroke.offset.x, y: stroke.offset.y },
	};
}

function transformWorldPoint(
	wx: number,
	wy: number,
	pivot: { x: number; y: number },
	scale: number,
	rotationRad: number,
): { x: number; y: number } {
	let x = wx - pivot.x;
	let y = wy - pivot.y;
	x *= scale;
	y *= scale;
	if (rotationRad !== 0) {
		const cos = Math.cos(rotationRad);
		const sin = Math.sin(rotationRad);
		const rx = x * cos - y * sin;
		const ry = x * sin + y * cos;
		x = rx;
		y = ry;
	}
	return { x: x + pivot.x, y: y + pivot.y };
}

/**
 * Bakes uniform scale and rotation about a shared pivot into stroke geometry.
 * World space is local points plus per-stroke offset; result uses offset zero.
 */
export function transformStrokesAroundPivot(
	strokes: InkStroke[],
	pivot: { x: number; y: number },
	scale: number,
	rotationRad: number,
): InkStroke[] {
	if (scale === 1 && rotationRad === 0) {
		return strokes.map(cloneStroke);
	}

	return strokes.map((stroke) => {
		const nextPoints: InkPoint[] = stroke.points.map(([x, y, pressure]) => {
			const wx = x + stroke.offset.x;
			const wy = y + stroke.offset.y;
			const transformed = transformWorldPoint(wx, wy, pivot, scale, rotationRad);
			return [transformed.x, transformed.y, pressure];
		});
		return {
			...stroke,
			points: nextPoints,
			offset: { x: 0, y: 0 },
			style: {
				...stroke.style,
				size: stroke.style.size * scale,
			},
		};
	});
}

/** Distance from pivot used for uniform scale gestures. */
export function scaleFactorFromPointerDistance(
	pivot: { x: number; y: number },
	startPage: { x: number; y: number },
	currentPage: { x: number; y: number },
): number {
	const startDist = Math.hypot(startPage.x - pivot.x, startPage.y - pivot.y);
	const currentDist = Math.hypot(currentPage.x - pivot.x, currentPage.y - pivot.y);
	if (startDist < 1e-6) return 1;
	return currentDist / startDist;
}

/** Delta angle (radians) from pivot between two page-space pointers. */
export function rotationDeltaFromPointers(
	pivot: { x: number; y: number },
	startPage: { x: number; y: number },
	currentPage: { x: number; y: number },
): number {
	const a0 = Math.atan2(startPage.y - pivot.y, startPage.x - pivot.x);
	const a1 = Math.atan2(currentPage.y - pivot.y, currentPage.x - pivot.x);
	return a1 - a0;
}

/** Left-handed rotate handle sits on the opposite corner — invert delta so drag matches CCW affordance. */
export function rotationDeltaForDominantHand(
	dominantHand: 'left' | 'right',
	pivot: { x: number; y: number },
	startPage: { x: number; y: number },
	currentPage: { x: number; y: number },
): number {
	const delta = rotationDeltaFromPointers(pivot, startPage, currentPage);
	return dominantHand === 'left' ? -delta : delta;
}
