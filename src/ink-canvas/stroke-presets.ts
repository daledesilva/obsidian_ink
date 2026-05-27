import type { StrokeInputTreatAs } from 'src/logic/device-settings/device-settings-types';
import type { InkStrokeStyle } from './types';

/** Numeric perfect-freehand-style fields for pen hardware (Plan 3). */
export const PEN_NUMERIC_STROKE_PARTIAL: Pick<
	InkStrokeStyle,
	'thinning' | 'smoothing' | 'streamline' | 'simulatePressure'
> = {
	thinning: 0.62,
	smoothing: 0.62,
	streamline: 0.65,
	simulatePressure: false,
};

/** Numeric preset for mouse / velocity-simulated pressure (Plan 3). */
export const MOUSE_NUMERIC_STROKE_PARTIAL: Pick<
	InkStrokeStyle,
	'thinning' | 'smoothing' | 'streamline' | 'simulatePressure'
> = {
	thinning: 0.5,
	smoothing: 0.5,
	streamline: 0.5,
	simulatePressure: true,
};

/**
 * Builds a full stroke style for persistence: merges pen/mouse numeric preset with
 * user-chosen size and colour from the editor toolbar.
 */
export function buildInkStrokeStyleForTreatAs(
	base: InkStrokeStyle,
	treatAs: StrokeInputTreatAs,
): InkStrokeStyle {
	const numeric =
		treatAs === 'pen' ? PEN_NUMERIC_STROKE_PARTIAL : MOUSE_NUMERIC_STROKE_PARTIAL;
	return {
		...base,
		...numeric,
		inputKind: treatAs,
	};
}
