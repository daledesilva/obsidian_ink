/**
 * Stylus pressure capture tuning (Apple Pencil, active pens, etc.).
 * Applied at capture so stored strokes match what was drawn.
 *
 * Boox bridge pressure uses {@link BOOX_PEN_PRESSURE_GAIN} separately — values may
 * already be normalized on device.
 */

/** Multiplier on browser-reported [0, 1] pressure before clamp. */
export const PEN_PRESSURE_GAIN = 1.25;

/** Minimum stored pressure while path length is within the early-stroke window. */
export const PEN_MIN_START_PRESSURE = 0.15;

/**
 * Exponential smoothing for successive pen samples (0 = off).
 * Applied only when not merging into the previous point.
 */
export const PEN_PRESSURE_SMOOTHING_ALPHA = 0.4;

/** Ignore pen `pointermove` samples at or below this pressure (hover / lift jitter). */
export const PEN_HOVER_PRESSURE_EPSILON = 0.01;

/** Apply {@link PEN_MIN_START_PRESSURE} until path length exceeds `strokeSize *` this factor. */
export const PEN_EARLY_STROKE_FLOOR_LENGTH_MULTIPLIER = 1;

/** Gain for eInk Bridge points; 1 = clamp to [0, 1] only. */
export const BOOX_PEN_PRESSURE_GAIN = 1;

export function scaleAndClampPenPressure(raw: number, gain: number = PEN_PRESSURE_GAIN): number {
	if (!Number.isFinite(raw)) return 0;
	return Math.min(1, Math.max(0, raw * gain));
}

export function applyPenEarlyStrokePressureFloor(
	scaledPressure: number,
	strokePathLength: number,
	strokeSize: number,
	lengthMultiplier: number = PEN_EARLY_STROKE_FLOOR_LENGTH_MULTIPLIER,
): number {
	if (strokeSize <= 0) return Math.max(PEN_MIN_START_PRESSURE, scaledPressure);
	if (strokePathLength < strokeSize * lengthMultiplier) {
		return Math.max(PEN_MIN_START_PRESSURE, scaledPressure);
	}
	return scaledPressure;
}

/**
 * Scale, clamp, and optional start-of-stroke floor for one pointer sample.
 */
export function normalizePointerPenPressureForCapture(
	rawPressure: number,
	strokePathLength: number,
	strokeSize: number,
): number {
	const scaled = scaleAndClampPenPressure(rawPressure);
	return applyPenEarlyStrokePressureFloor(scaled, strokePathLength, strokeSize);
}

/** Normalize pressure from Boox / eInk Bridge before storing on the stroke. */
export function normalizeBooxPenPressureForCapture(rawPressure: number): number {
	return scaleAndClampPenPressure(rawPressure, BOOX_PEN_PRESSURE_GAIN);
}
