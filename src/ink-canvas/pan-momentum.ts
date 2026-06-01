/** Screen-space axis for pan flick inertia. */
export type PanMomentumAxis = 'x' | 'y' | 'xy';

export interface PanMomentumOptions {
	axis: PanMomentumAxis;
	/** Minimum release speed (px/s) to start coasting. */
	minReleaseVelocityPxPerSec?: number;
	/** Per-frame friction base at 60fps (velocity *= friction^(dt/16.67)). */
	frictionPerFrame?: number;
	/** Cap initial coast speed (px/s). */
	maxVelocityPxPerSec?: number;
	/** Stop coasting below this speed (px/s). */
	stopVelocityPxPerSec?: number;
	/** Window for release velocity estimate (ms). */
	velocityWindowMs?: number;
}

export interface PanMomentumController {
	recordScreenDelta(deltaScreenX: number, deltaScreenY: number, timestampMs?: number): void;
	cancel(): void;
	/** Start coasting; applyFrame returns false to stop (e.g. scroll clamp). */
	release(applyFrame: (deltaScreenX: number, deltaScreenY: number) => boolean): void;
	isActive(): boolean;
}

type PanSample = { t: number; dx: number; dy: number };

const DEFAULT_MIN_RELEASE_VELOCITY = 100;
const DEFAULT_FRICTION_PER_FRAME = 0.92;
const DEFAULT_MAX_VELOCITY = 4000;
const DEFAULT_STOP_VELOCITY = 15;
const DEFAULT_VELOCITY_WINDOW_MS = 120;
const SAMPLE_RETENTION_MS = 150;

/**
 * Heuristic: pixel-mode wheel with small deltas (typical trackpad).
 * May misclassify on some platforms; only affects optional wheel momentum.
 */
export function isTrackpadWheel(event: WheelEvent): boolean {
	if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return false;
	return Math.abs(event.deltaY) < 100 && Math.abs(event.deltaX) < 100;
}

export function createPanMomentumController(options: PanMomentumOptions): PanMomentumController {
	const axis = options.axis;
	const minReleaseVelocity = options.minReleaseVelocityPxPerSec ?? DEFAULT_MIN_RELEASE_VELOCITY;
	const frictionPerFrame = options.frictionPerFrame ?? DEFAULT_FRICTION_PER_FRAME;
	const maxVelocity = options.maxVelocityPxPerSec ?? DEFAULT_MAX_VELOCITY;
	const stopVelocity = options.stopVelocityPxPerSec ?? DEFAULT_STOP_VELOCITY;
	const velocityWindowMs = options.velocityWindowMs ?? DEFAULT_VELOCITY_WINDOW_MS;

	let samples: PanSample[] = [];
	let rafId: number | null = null;
	let velocityX = 0;
	let velocityY = 0;
	let lastFrameTimeMs = 0;

	const pruneSamples = (now: number) => {
		while (samples.length > 0 && now - samples[0].t > SAMPLE_RETENTION_MS) {
			samples.shift();
		}
	};

	const capVelocity = (vx: number, vy: number): { vx: number; vy: number } => {
		if (axis === 'y') vx = 0;
		if (axis === 'x') vy = 0;
		const speed = Math.hypot(vx, vy);
		if (speed <= maxVelocity || speed === 0) return { vx, vy };
		const scale = maxVelocity / speed;
		return { vx: vx * scale, vy: vy * scale };
	};

	const computeReleaseVelocity = (now: number): { vx: number; vy: number } | null => {
		const recent = samples.filter((s) => now - s.t <= velocityWindowMs);
		if (recent.length < 2) return null;

		let totalDx = 0;
		let totalDy = 0;
		const tStart = recent[0].t;
		const tEnd = recent[recent.length - 1].t;
		const dtMs = Math.max(tEnd - tStart, 1);
		for (const sample of recent) {
			totalDx += sample.dx;
			totalDy += sample.dy;
		}

		let vx = (totalDx / dtMs) * 1000;
		let vy = (totalDy / dtMs) * 1000;
		({ vx, vy } = capVelocity(vx, vy));

		const speed = Math.hypot(vx, vy);
		if (speed < minReleaseVelocity) return null;
		return { vx, vy };
	};

	const stopAnimation = () => {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
		velocityX = 0;
		velocityY = 0;
	};

	return {
		recordScreenDelta(deltaScreenX: number, deltaScreenY: number, timestampMs = performance.now()) {
			if (deltaScreenX === 0 && deltaScreenY === 0) return;
			pruneSamples(timestampMs);
			samples.push({ t: timestampMs, dx: deltaScreenX, dy: deltaScreenY });
		},

		cancel() {
			stopAnimation();
			samples = [];
		},

		isActive() {
			return rafId !== null;
		},

		release(applyFrame) {
			stopAnimation();
			const now = performance.now();
			const releaseVelocity = computeReleaseVelocity(now);
			samples = [];
			if (!releaseVelocity) return;

			velocityX = releaseVelocity.vx;
			velocityY = releaseVelocity.vy;
			lastFrameTimeMs = now;

			const tick = (frameTimeMs: number) => {
				const dtMs = Math.max(frameTimeMs - lastFrameTimeMs, 1);
				lastFrameTimeMs = frameTimeMs;

				const friction = Math.pow(frictionPerFrame, dtMs / (1000 / 60));
				velocityX *= friction;
				velocityY *= friction;

				const speed = Math.hypot(velocityX, velocityY);
				if (speed < stopVelocity) {
					stopAnimation();
					return;
				}

				const deltaScreenX = velocityX * (dtMs / 1000);
				const deltaScreenY = velocityY * (dtMs / 1000);
				const shouldContinue = applyFrame(deltaScreenX, deltaScreenY);
				if (!shouldContinue) {
					stopAnimation();
					return;
				}

				rafId = window.requestAnimationFrame(tick);
			};

			rafId = window.requestAnimationFrame(tick);
		},
	};
}
