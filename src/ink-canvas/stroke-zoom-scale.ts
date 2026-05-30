import { clampZoom } from './camera';

/** Zoom level presets and merge thresholds were tuned at this camera zoom. */
export const INK_STROKE_ZOOM_REFERENCE = 1;

/**
 * Scale a 0–1 stroke numeric (streamline, smoothing) so effective smoothing stays
 * roughly constant in screen space as capture zoom changes.
 */
export function numericForCaptureZoom(
	value: number,
	captureZoom: number,
	zoomRef: number = INK_STROKE_ZOOM_REFERENCE,
): number {
	const scale = zoomRef / clampCaptureZoom(captureZoom);
	return Math.min(1, Math.max(0, value * scale));
}

/** Page-space merge radius for `mergeNearDuplicatePoints` at capture zoom. */
export function nearDuplicateMergeDistancePage(
	size: number,
	captureZoom: number,
	zoomRef: number = INK_STROKE_ZOOM_REFERENCE,
): number {
	return (size / 3) * (zoomRef / clampCaptureZoom(captureZoom));
}

export function nearDuplicateMergeThresholdSq(
	size: number,
	captureZoom: number,
	zoomRef: number = INK_STROKE_ZOOM_REFERENCE,
): number {
	const distance = nearDuplicateMergeDistancePage(size, captureZoom, zoomRef);
	return distance * distance;
}

export function clampCaptureZoom(zoom: number): number {
	return clampZoom(zoom);
}
