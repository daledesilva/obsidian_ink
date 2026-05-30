import type { StrokeInputTreatAs } from 'src/logic/device-settings/device-settings-types';
import type { InkStrokeStyle } from './types';
import {
	clampCaptureZoom,
	INK_STROKE_ZOOM_REFERENCE,
	numericForCaptureZoom,
} from './stroke-zoom-scale';

/** Pen @ 1× — zoom-out target 0.2 at 0.1× (half of mouse step). */
export const PEN_NUMERIC_STROKE_PARTIAL: Pick<
	InkStrokeStyle,
	'thinning' | 'smoothing' | 'streamline' | 'simulatePressure'
> = {
	thinning: 0.6,
	smoothing: 0.1,
	streamline: 0.1,
	simulatePressure: false,
};

/** Mouse @ 1× — zoom-out target 0.4 at 0.1× (+0.2 vs reference). */
export const MOUSE_NUMERIC_STROKE_PARTIAL: Pick<
	InkStrokeStyle,
	'thinning' | 'smoothing' | 'streamline' | 'simulatePressure'
> = {
	thinning: 0.6,
	smoothing: 0.4,
	streamline: 0.4,
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
	captureZoom: number = INK_STROKE_ZOOM_REFERENCE,
): InkStrokeStyle {
	const numeric =
		treatAs === 'pen' ? PEN_NUMERIC_STROKE_PARTIAL : MOUSE_NUMERIC_STROKE_PARTIAL;
	const size = treatAs === 'mouse' ? base.size * OPTICAL_MOUSE_TO_PEN_RATIO : base.size;
	const zoom = clampCaptureZoom(captureZoom);
	return {
		...base,
		...numeric,
		size,
		streamline: numericForCaptureZoom(numeric.streamline, zoom, treatAs),
		smoothing: numericForCaptureZoom(numeric.smoothing, zoom, treatAs),
		inputKind: treatAs,
		captureZoom: zoom,
	};
}
