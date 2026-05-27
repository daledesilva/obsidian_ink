import type { StrokeOptions, Vec2 } from 'perfect-freehand';
import { getStrokeOutlinePoints } from 'perfect-freehand';
import type { InkPoint } from '../types';
import { getInkStrokePoints } from './get-ink-stroke-points';

export function getInkStrokeOutline(points: InkPoint[], options: StrokeOptions): Vec2[] {
	const strokePoints = getInkStrokePoints(points, options);
	return getStrokeOutlinePoints(strokePoints, options);
}

