/**
 * Ink canvas eraser hit-testing tuning at reference zoom 1×.
 * Actual screen pixels are computed via {@link eraserHitRadiusScreenPx} /
 * {@link eraserSweepSpacingScreenPx} in `stroke-zoom-scale.ts`.
 */

/** Hit radius at 1× zoom (filled disk + boundary samples); scaled for camera zoom. */
export const ERASER_HIT_RADIUS_REFERENCE = 15;

/** Dense boundary probes (about one screen pixel apart at the reference radius). */
export const ERASER_RING_SAMPLE_COUNT = 96;

/** Maximum spacing of filled-area and swept-path samples at 1× zoom; scaled for camera zoom. */
export const ERASER_SWEEP_SAMPLE_SPACING_REFERENCE = 1;

/** Original sparse detection pattern, used when dense detection is disabled. */
export const ERASER_SPARSE_RING_SAMPLE_COUNT = 8;
export const ERASER_SPARSE_SWEEP_SAMPLE_SPACING_REFERENCE = 8;

/** CSS class on stroke groups while the eraser marks them for removal. */
export const INK_STROKE_PENDING_ERASE_CLASS = 'ink-stroke--pending-erase';

/** Pending-erase preview animation duration (ms); keep in sync with ink-svg-canvas.scss. */
export const INK_STROKE_PENDING_ERASE_ANIMATION_MS = 1000;
