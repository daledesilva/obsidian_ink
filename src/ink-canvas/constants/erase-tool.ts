/**
 * Ink canvas eraser hit-testing tuning at reference zoom 1×.
 * Actual screen pixels are computed via {@link eraserHitRadiusScreenPx} /
 * {@link eraserSweepSpacingScreenPx} in `stroke-zoom-scale.ts`.
 */

/** Hit radius at 1× zoom (center + ring samples); scaled for camera zoom. */
export const ERASER_HIT_RADIUS_REFERENCE = 15;

/** Number of points on the ring at the scaled hit radius. */
export const ERASER_RING_SAMPLE_COUNT = 8;

/** Sweep sample spacing at 1× zoom along the drag path; scaled for camera zoom. */
export const ERASER_SWEEP_SAMPLE_SPACING_REFERENCE = 8;

/** CSS class on stroke groups while the eraser marks them for removal. */
export const INK_STROKE_PENDING_ERASE_CLASS = 'ink-stroke--pending-erase';

/** Pending-erase preview animation duration (ms); keep in sync with ink-svg-canvas.scss. */
export const INK_STROKE_PENDING_ERASE_ANIMATION_MS = 1000;
