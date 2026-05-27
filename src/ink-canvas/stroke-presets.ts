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

/** Multiply editor stroke width when using mouse treat-as (simulated stroke reads narrower than pen). */
// 1.6 matches optically to mouse in pen setting, but not necessarily pen in pen setting.
// TODO: We should let pen as pen be 1, but mouse as pen should be 1.6 
export const OPTICAL_MOUSE_TO_PEN_RATIO = 1;

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
	const size = treatAs === 'mouse' ? base.size * OPTICAL_MOUSE_TO_PEN_RATIO : base.size;
	return {
		...base,
		...numeric,
		size,
		inputKind: treatAs,
	};
}
