import { clampZoom } from './camera';
import {
	ERASER_HIT_RADIUS_REFERENCE,
	ERASER_SWEEP_SAMPLE_SPACING_REFERENCE,
} from './constants/erase-tool';
import type { StrokeInputTreatAs } from 'src/logic/device-settings/device-settings-types';

/** Zoom level presets were tuned at this camera zoom. */
export const INK_STROKE_ZOOM_REFERENCE = 1;

/** Must match `MIN_ZOOM` in `camera.ts`. */
export const INK_STROKE_ZOOM_MIN = 0.1;

/** Streamline / smoothing at max zoom-out (`z_min`). */
export const STREAMLINE_SMOOTHING_ZOOM_OUT_TARGET: Record<StrokeInputTreatAs, number> = {
	pen: 0.2,
	mouse: 0.65,
};

export function clampCaptureZoom(zoom: number): number {
	return clampZoom(zoom);
}

/**
 * 0 at `z_ref`, 1 at `z_min` — for zoom-out interpolation only.
 */
export function captureZoomLerpT(
	captureZoom: number,
	zoomRef: number = INK_STROKE_ZOOM_REFERENCE,
	zoomMin: number = INK_STROKE_ZOOM_MIN,
): number {
	const z = clampCaptureZoom(captureZoom);
	if (z >= zoomRef) return 0;
	const t = (1 / z - 1) / (1 / zoomMin - 1);
	return Math.min(1, Math.max(0, t));
}

/**
 * Reference value at 1×; zoom out lerps toward `zoomOutTarget` at `z_min`;
 * zoom in scales down as `reference * (zoomRef / z)`.
 */
export function metricForCaptureZoom(
	referenceValue: number,
	zoomOutTarget: number,
	captureZoom: number,
	zoomRef: number = INK_STROKE_ZOOM_REFERENCE,
): number {
	const z = clampCaptureZoom(captureZoom);
	if (z < zoomRef) {
		const t = captureZoomLerpT(z, zoomRef, INK_STROKE_ZOOM_MIN);
		return referenceValue + t * (zoomOutTarget - referenceValue);
	}
	return referenceValue * (zoomRef / z);
}

/** Scale streamline or smoothing (0–1) for capture zoom and input kind. */
export function numericForCaptureZoom(
	referenceValue: number,
	captureZoom: number,
	treatAs: StrokeInputTreatAs,
	zoomRef: number = INK_STROKE_ZOOM_REFERENCE,
): number {
	const target = STREAMLINE_SMOOTHING_ZOOM_OUT_TARGET[treatAs];
	const value = metricForCaptureZoom(referenceValue, target, captureZoom, zoomRef);
	return Math.min(1, Math.max(0, value));
}

/** Page-space merge radius for `mergeNearDuplicatePoints` (same zoom curve, wider at zoom-out). */
export function nearDuplicateMergeDistancePage(
	size: number,
	captureZoom: number,
	zoomRef: number = INK_STROKE_ZOOM_REFERENCE,
): number {
	const referenceDistance = size / 3;
	const zoomOutDistance = referenceDistance * (zoomRef / INK_STROKE_ZOOM_MIN);
	return metricForCaptureZoom(referenceDistance, zoomOutDistance, captureZoom, zoomRef);
}

export function nearDuplicateMergeThresholdSq(
	size: number,
	captureZoom: number,
	zoomRef: number = INK_STROKE_ZOOM_REFERENCE,
): number {
	const distance = nearDuplicateMergeDistancePage(size, captureZoom, zoomRef);
	return distance * distance;
}

/**
 * Screen-space metric that stays visually constant across camera zoom (same curve as
 * page-space `metricForCaptureZoom`, multiplied by `z` for client-pixel hit testing).
 */
export function screenConstantMetricForCameraZoom(
	referenceValue: number,
	cameraZoom: number,
	zoomRef: number = INK_STROKE_ZOOM_REFERENCE,
): number {
	const z = clampCaptureZoom(cameraZoom);
	const zoomOutTarget = referenceValue * (zoomRef / INK_STROKE_ZOOM_MIN);
	return metricForCaptureZoom(referenceValue, zoomOutTarget, z, zoomRef) * z;
}

/** Eraser hit radius in screen pixels for the current camera zoom. */
export function eraserHitRadiusScreenPx(cameraZoom: number): number {
	return screenConstantMetricForCameraZoom(ERASER_HIT_RADIUS_REFERENCE, cameraZoom);
}

/** Eraser sweep spacing in screen pixels for the current camera zoom. */
export function eraserSweepSpacingScreenPx(cameraZoom: number): number {
	return screenConstantMetricForCameraZoom(ERASER_SWEEP_SAMPLE_SPACING_REFERENCE, cameraZoom);
}
