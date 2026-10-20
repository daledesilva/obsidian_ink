import { nanoid } from 'nanoid';
import { WRITING_LINE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';
import type { InkPoint, InkStroke } from 'src/ink-canvas/types';
import { DEFAULT_STROKE_STYLE } from 'src/ink-canvas/types';
import type { PhotoTraceResult } from './trace-from-raster';

//////////
//////////

export interface HandwritingVectorStroke {
	points: [number, number][];
}

/**
 * Maps 0–1 page-space polylines onto the writing canvas. Pressure is fixed
 * because the model does not return width.
 */
export function mapHandwritingVectorStrokesToInk(
	strokes: HandwritingVectorStroke[],
	pageWidthPx: number,
	pageHeightPx: number,
): PhotoTraceResult {
	const margin = WRITING_PAGE_WIDTH * 0.05;
	const contentWidth = WRITING_PAGE_WIDTH - margin * 2;
	const aspect = Math.max(0.2, pageHeightPx / Math.max(1, pageWidthPx));
	const destWidth = contentWidth;
	const destHeight = contentWidth * aspect;
	const mapped: [number, number][][] = [];
	const inkStrokes: InkStroke[] = [];
	const now = Date.now();
	for (const stroke of strokes) {
		if (stroke.points.length < 2) continue;
		const unitPoints: [number, number][] = [];
		for (const [rawX, rawY] of stroke.points) {
			// Flash Lite often ignores 0–1 and emits image pixels (e.g. 510, 856).
			const nx = rawX > 1.5 || rawY > 1.5 ? rawX / Math.max(1, pageWidthPx) : rawX;
			const ny = rawX > 1.5 || rawY > 1.5 ? rawY / Math.max(1, pageHeightPx) : rawY;
			unitPoints.push([nx, ny]);
		}
		if (isPrintedRulingUnitStroke(unitPoints)) continue;
		const points: [number, number][] = [];
		const inkPoints: InkPoint[] = [];
		for (const [nx, ny] of unitPoints) {
			const x = nx * destWidth + margin;
			const y = ny * destHeight + margin;
			points.push([x, y]);
			inkPoints.push([x, y, 0.5]);
		}
		mapped.push(points);
		inkStrokes.push({
			id: nanoid(),
			points: inkPoints,
			style: {
				...DEFAULT_STROKE_STYLE,
				size: 5.5,
				thinning: 0.2,
				simulatePressure: false,
				inputKind: 'pen',
			},
			offset: { x: 0, y: 0 },
			startedAt: now,
			finishedAt: now,
			authoringSource: 'local',
		});
	}
	return {
		strokes: inkStrokes,
		writingLineHeight: estimateWritingLineHeight(mapped, WRITING_LINE_HEIGHT),
	};
}

function isPrintedRulingUnitStroke(points: [number, number][]): boolean {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const [x, y] of points) {
		if (x < minX) minX = x;
		if (x > maxX) maxX = x;
		if (y < minY) minY = y;
		if (y > maxY) maxY = y;
	}
	const spanX = maxX - minX;
	const spanY = maxY - minY;
	if (spanX > 0.45 && spanY < 0.02) return true;
	if (spanY > 0.45 && spanX < 0.02) return true;
	return false;
}

function estimateWritingLineHeight(polylines: [number, number][][], fallback: number): number {
	const ySamples: number[] = [];
	for (const line of polylines) {
		if (line.length === 0) continue;
		let sumY = 0;
		for (const [, y] of line) sumY += y;
		ySamples.push(sumY / line.length);
	}
	ySamples.sort((a, b) => a - b);
	if (ySamples.length < 2) return fallback;
	const gaps: number[] = [];
	for (let i = 1; i < ySamples.length; i++) {
		const gap = ySamples[i] - ySamples[i - 1];
		if (gap > fallback * 0.35) gaps.push(gap);
	}
	if (gaps.length === 0) return fallback;
	gaps.sort((a, b) => a - b);
	return Math.round(gaps[Math.floor(gaps.length / 2)]);
}
