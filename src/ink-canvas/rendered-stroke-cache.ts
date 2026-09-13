import { getStroke } from 'perfect-freehand';
import type { InkStroke } from './types';
import { toStrokeOptions } from './types';
import { getSvgPathFromStroke } from './utils/svg-path-from-stroke';

export type RenderedStrokeBounds = {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
};

export type RenderedStrokeData = {
	pathD: string;
	bounds: RenderedStrokeBounds;
};

// Strokes are immutable in normal use. A WeakMap lets editor rendering and
// autosave share the expensive perfect-freehand outline without retaining
// deleted strokes.
const renderedStrokeCache = new WeakMap<InkStroke, RenderedStrokeData>();

export function getRenderedStrokeData(stroke: InkStroke): RenderedStrokeData {
	const cached = renderedStrokeCache.get(stroke);
	if (cached) return cached;

	const outlinePoints = getStroke(stroke.points, toStrokeOptions(stroke.style));
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	for (const [x, y] of outlinePoints) {
		if (x < minX) minX = x;
		if (y < minY) minY = y;
		if (x > maxX) maxX = x;
		if (y > maxY) maxY = y;
	}

	const data: RenderedStrokeData = {
		pathD: getSvgPathFromStroke(outlinePoints),
		bounds: Number.isFinite(minX)
			? { minX, minY, maxX, maxY }
			: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
	};
	renderedStrokeCache.set(stroke, data);
	return data;
}
