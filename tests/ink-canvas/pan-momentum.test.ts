import {
	createPanMomentumController,
	isTrackpadWheel,
} from 'src/ink-canvas/pan-momentum';

describe('isTrackpadWheel', () => {
	it('returns true for fine-grained pixel-mode deltas', () => {
		const event = {
			deltaMode: WheelEvent.DOM_DELTA_PIXEL,
			deltaX: 2,
			deltaY: -4,
		} as WheelEvent;
		expect(isTrackpadWheel(event)).toBe(true);
	});

	it('returns false for line-mode wheel', () => {
		const event = {
			deltaMode: WheelEvent.DOM_DELTA_LINE,
			deltaX: 0,
			deltaY: 3,
		} as WheelEvent;
		expect(isTrackpadWheel(event)).toBe(false);
	});

	it('returns false for large pixel jumps (mouse wheel)', () => {
		const event = {
			deltaMode: WheelEvent.DOM_DELTA_PIXEL,
			deltaX: 0,
			deltaY: 120,
		} as WheelEvent;
		expect(isTrackpadWheel(event)).toBe(false);
	});
});

describe('createPanMomentumController', () => {
	let rafCallbacks: FrameRequestCallback[] = [];
	let rafId = 0;
	let mockNow = 0;

	beforeEach(() => {
		jest.useFakeTimers();
		mockNow = 0;
		rafCallbacks = [];
		rafId = 0;
		jest.spyOn(performance, 'now').mockImplementation(() => mockNow);
		global.requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
			rafCallbacks.push(cb);
			rafId += 1;
			return rafId;
		});
		global.cancelAnimationFrame = jest.fn();
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	const flushOneFrame = (advanceMs: number) => {
		mockNow += advanceMs;
		jest.advanceTimersByTime(advanceMs);
		const cb = rafCallbacks.shift();
		if (cb) cb(mockNow);
	};

	it('estimates release velocity from recent samples and applies decaying frames', () => {
		const controller = createPanMomentumController({
			axis: 'xy',
			minReleaseVelocityPxPerSec: 50,
		});
		const applied: { dx: number; dy: number }[] = [];

		mockNow = 1000;
		controller.recordScreenDelta(0, 40);
		mockNow += 16;
		controller.recordScreenDelta(0, 40);
		mockNow += 16;
		controller.recordScreenDelta(0, 40);

		controller.release((dx, dy) => {
			applied.push({ dx, dy });
			return true;
		});

		expect(applied.length).toBe(0);
		expect(controller.isActive()).toBe(true);

		for (let i = 0; i < 8; i++) {
			flushOneFrame(16);
		}

		expect(applied.length).toBeGreaterThan(0);
		expect(applied[0].dy).toBeGreaterThan(0);
	});

	it('cancel stops an in-flight coast', () => {
		const controller = createPanMomentumController({
			axis: 'y',
			minReleaseVelocityPxPerSec: 10,
		});
		const applied: number[] = [];

		mockNow = 2000;
		controller.recordScreenDelta(0, 30);
		mockNow += 20;
		controller.recordScreenDelta(0, 30);
		controller.release((_dx, dy) => {
			applied.push(dy);
			return true;
		});

		flushOneFrame(16);
		expect(applied.length).toBe(1);

		controller.cancel();
		expect(controller.isActive()).toBe(false);

		flushOneFrame(16);
		expect(applied.length).toBe(1);
	});

	it('release does nothing when speed is below minimum', () => {
		const controller = createPanMomentumController({
			axis: 'xy',
			minReleaseVelocityPxPerSec: 5000,
		});
		mockNow = 1000;
		controller.recordScreenDelta(0, 5);
		mockNow += 10;
		controller.recordScreenDelta(0, 5);
		controller.release(() => true);
		expect(controller.isActive()).toBe(false);
	});

	it('stops coast when applyFrame returns false', () => {
		const controller = createPanMomentumController({
			axis: 'y',
			minReleaseVelocityPxPerSec: 10,
		});
		let frames = 0;
		mockNow = 3000;
		controller.recordScreenDelta(0, 50);
		mockNow += 20;
		controller.recordScreenDelta(0, 50);
		controller.release(() => {
			frames += 1;
			return frames < 2;
		});

		flushOneFrame(16);
		flushOneFrame(16);
		flushOneFrame(16);
		expect(frames).toBe(2);
		expect(controller.isActive()).toBe(false);
	});

	it('zeros horizontal velocity when axis is y', () => {
		const controller = createPanMomentumController({
			axis: 'y',
			minReleaseVelocityPxPerSec: 50,
		});
		const applied: { dx: number; dy: number }[] = [];
		mockNow = 4000;
		controller.recordScreenDelta(80, 40);
		mockNow += 20;
		controller.recordScreenDelta(80, 40);
		controller.release((dx, dy) => {
			applied.push({ dx, dy });
			return true;
		});
		flushOneFrame(16);
		expect(applied[0].dx).toBe(0);
		expect(applied[0].dy).not.toBe(0);
	});
});
