import type { InkStrokeStyle } from './types';

/** Pressure easing for pen strokes (not persisted in JSON). Plan 3 curve. */
export function penStrokePressureEasing(t: number): number {
	return t * 0.65 + Math.sin((t * Math.PI) / 2) * 0.35;
}

export function identityStrokePressureEasing(t: number): number {
	return t;
}

/** Whether stored stroke style should use pen easing when calling perfect-freehand. */
export function inkStrokeUsesPenEasing(style: InkStrokeStyle): boolean {
	if (style.inputKind === 'pen') return true;
	if (style.inputKind === 'mouse') return false;
	// Legacy strokes: no inputKind — infer from simulatePressure (false = real pen / bridge).
	return !style.simulatePressure;
}
