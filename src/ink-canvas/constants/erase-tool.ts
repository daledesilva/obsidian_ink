/**
 * Ink canvas eraser hit-testing tuning (screen-space CSS pixels).
 * {@link ERASER_HIT_RADIUS_SCREEN_PX} is aligned with eInk Bridge raw eraser width (~20px).
 */

/** Radius around the pointer tested for stroke hits (center + ring samples). */
export const ERASER_HIT_RADIUS_SCREEN_PX = 20;

/** Number of points on the ring at {@link ERASER_HIT_RADIUS_SCREEN_PX}. */
export const ERASER_RING_SAMPLE_COUNT = 8;

/** Spacing between sweep samples along the pointer path (fast-drag gap fill). */
export const ERASER_SWEEP_SAMPLE_SPACING_PX = 8;
