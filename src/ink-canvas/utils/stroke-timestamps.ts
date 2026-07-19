import type { InkStroke } from '../types';

/** Derive stroke-level start/end from Boox per-point timestamps (epoch ms). */
export function inkStrokeTimestampsFromBooxPoints(
	points: { timestamp: number }[],
): Pick<InkStroke, 'startedAt' | 'finishedAt'> | undefined {
	if (points.length === 0) return undefined;
	return {
		startedAt: points[0].timestamp,
		finishedAt: points[points.length - 1].timestamp,
	};
}
