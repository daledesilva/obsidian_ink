import type { ResolvedStrokeInputTreatAs } from './device-settings-types';

/**
 * Classify input from raw pointer pressures collected during a stroke.
 * All samples identical → mouse; any variation → pen.
 */
export function detectStrokeInputFromRawPressures(
	pressures: readonly number[],
): ResolvedStrokeInputTreatAs {
	if (pressures.length === 0) return 'mouse';
	const first = pressures[0];
	return pressures.every((p) => p === first) ? 'mouse' : 'pen';
}
