/** Screen-space filter for the opt-in balanced preset; never predicts future points. */
export const MAX_PEN_FILTER_OFFSET_PX = 0.6;

const MIN_CUTOFF_HZ = 4;
const SPEED_CUTOFF_HZ = 1;
const SPEED_RESPONSE = 0.08;

function alpha(cutoffHz: number, dtSeconds: number): number {
	const value = 2 * Math.PI * cutoffHz * dtSeconds;
	return value / (1 + value);
}

/**
 * A bounded One Euro style filter. Slow movements get more jitter filtering;
 * fast movements raise the cutoff. The displacement cap prevents a long trailing
 * tail at corners. Coordinates stay in CSS pixels, independent of canvas zoom.
 */
export class BoundedPenPositionFilter {
	private rawX: number;
	private rawY: number;
	private x: number;
	private y: number;
	private timeMs: number;
	private speed = 0;

	constructor(x: number, y: number, timeMs: number) {
		this.rawX = this.x = x;
		this.rawY = this.y = y;
		this.timeMs = timeMs;
	}

	update(rawX: number, rawY: number, timeMs: number): { x: number; y: number } {
		// Re-delivery of one event must not advance the filter a second time.
		if (timeMs === this.timeMs && rawX === this.rawX && rawY === this.rawY) {
			return { x: this.x, y: this.y };
		}
		const elapsed = timeMs - this.timeMs;
		const dt = Number.isFinite(elapsed) && elapsed > 0
			? Math.min(0.05, Math.max(0.001, elapsed / 1000))
			: 1 / 120;
		const speed = Math.hypot(rawX - this.rawX, rawY - this.rawY) / dt;
		this.speed += alpha(SPEED_CUTOFF_HZ, dt) * (speed - this.speed);
		const blend = alpha(MIN_CUTOFF_HZ + SPEED_RESPONSE * this.speed, dt);
		let x = this.x + blend * (rawX - this.x);
		let y = this.y + blend * (rawY - this.y);
		const offset = Math.hypot(x - rawX, y - rawY);
		if (offset > MAX_PEN_FILTER_OFFSET_PX) {
			const ratio = MAX_PEN_FILTER_OFFSET_PX / offset;
			x = rawX + (x - rawX) * ratio;
			y = rawY + (y - rawY) * ratio;
		}
		this.rawX = rawX;
		this.rawY = rawY;
		this.timeMs = timeMs;
		this.x = x;
		this.y = y;
		return { x, y };
	}
}
