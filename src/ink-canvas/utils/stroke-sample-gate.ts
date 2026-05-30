import type { CameraState, InkPoint } from '../types';
import { pageDistanceForScreenPixels } from '../camera';

/**
 * When true, each candidate page position must pass {@link shouldAcceptStrokePageSample}
 * before merge/live capture (coalesced batches and single pointer events alike).
 *
 * Retired (false): on-device testing showed this distance gate targets the wrong regime — it only
 * thins slow strokes (visible as a posterized tip) and does nothing for the fast-stroke artifacts,
 * which were a radius-slew / outline self-intersection issue fixed via PEN_PRESSURE_SLEW_PER_SIZE.
 * Kept behind the flag for reference / possible reuse.
 */
export const FILTER_STROKE_SAMPLES_BY_ACCEPTED_TIP = false;

/**
 * Minimum separation from the accepted trail tip in screen pixels (page distance = px / zoom).
 * Independent of Plan 2 merge threshold (~1 screen px on the storage path).
 */
export const STROKE_SAMPLE_MIN_FROM_ACCEPTED_TIP_SCREEN_PX = 1;

export interface PagePoint {
	x: number;
	y: number;
}

/** Accepted tip on the in-progress stroke trail (`livePreviewPoints`). */
export interface AcceptedTipState {
	tip: PagePoint | null;
	prev: PagePoint | null;
}

export function minPageDistanceFromAcceptedTip(camera: CameraState): number {
	return pageDistanceForScreenPixels(camera, STROKE_SAMPLE_MIN_FROM_ACCEPTED_TIP_SCREEN_PX);
}

export function acceptedTipStateFromLivePreview(livePreviewPoints: InkPoint[]): AcceptedTipState {
	if (livePreviewPoints.length === 0) {
		return { tip: null, prev: null };
	}
	const last = livePreviewPoints[livePreviewPoints.length - 1];
	const tip: PagePoint = { x: last[0], y: last[1] };
	if (livePreviewPoints.length < 2) {
		return { tip, prev: null };
	}
	const beforeLast = livePreviewPoints[livePreviewPoints.length - 2];
	return { tip, prev: { x: beforeLast[0], y: beforeLast[1] } };
}

export function isBackwardStrokeSample(
	page: PagePoint,
	acceptedTip: PagePoint,
	acceptedPrev: PagePoint | null,
	minPageDistance: number,
): boolean {
	if (!acceptedPrev) return false;

	const strokeX = acceptedTip.x - acceptedPrev.x;
	const strokeY = acceptedTip.y - acceptedPrev.y;
	const stepX = page.x - acceptedTip.x;
	const stepY = page.y - acceptedTip.y;
	const dot = strokeX * stepX + strokeY * stepY;
	if (dot >= 0) return false;

	const stepDistSq = stepX * stepX + stepY * stepY;
	const minDistSq = minPageDistance * minPageDistance;
	return stepDistSq < minDistSq;
}

export function isFarEnoughFromAcceptedTip(
	page: PagePoint,
	acceptedTip: PagePoint,
	minPageDistance: number,
): boolean {
	const dx = page.x - acceptedTip.x;
	const dy = page.y - acceptedTip.y;
	const minDistSq = minPageDistance * minPageDistance;
	return dx * dx + dy * dy >= minDistSq;
}

/**
 * Whether to ingest this page-space sample into the stroke.
 * Compares only to the accepted tip; rejected positions are not used as reference.
 */
export function shouldAcceptStrokePageSample(
	page: PagePoint,
	acceptedTip: PagePoint | null,
	acceptedPrev: PagePoint | null,
	minPageDistance: number,
): boolean {
	if (!acceptedTip) return true;
	if (isBackwardStrokeSample(page, acceptedTip, acceptedPrev, minPageDistance)) return false;
	return isFarEnoughFromAcceptedTip(page, acceptedTip, minPageDistance);
}

export function advanceAcceptedTipState(state: AcceptedTipState, page: PagePoint): void {
	if (state.tip) {
		state.prev = { x: state.tip.x, y: state.tip.y };
	}
	state.tip = { x: page.x, y: page.y };
}
