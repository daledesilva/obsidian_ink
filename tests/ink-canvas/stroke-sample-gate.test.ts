import {
	acceptedTipStateFromLivePreview,
	advanceAcceptedTipState,
	isBackwardStrokeSample,
	minPageDistanceFromAcceptedTip,
	shouldAcceptStrokePageSample,
} from 'src/ink-canvas/utils/stroke-sample-gate';
import type { CameraState } from 'src/ink-canvas/types';

const cameraAtZoom = (zoom: number): CameraState => ({ x: 0, y: 0, zoom });

describe('stroke-sample-gate', () => {
	it('scales min page distance with zoom', () => {
		expect(minPageDistanceFromAcceptedTip(cameraAtZoom(1))).toBe(10);
		expect(minPageDistanceFromAcceptedTip(cameraAtZoom(2))).toBe(5);
	});

	it('accepts first sample when trail is empty', () => {
		const state = acceptedTipStateFromLivePreview([]);
		expect(
			shouldAcceptStrokePageSample({ x: 0, y: 0 }, state.tip, state.prev, 1),
		).toBe(true);
	});

	it('rejects sample too close to accepted tip only', () => {
		const tip = { x: 0, y: 0 };
		const prev = { x: -10, y: 0 };
		expect(shouldAcceptStrokePageSample({ x: 5, y: 0 }, tip, prev, 10)).toBe(false);
		expect(shouldAcceptStrokePageSample({ x: 12, y: 0 }, tip, prev, 10)).toBe(true);
	});

	it('second accept compares to updated accepted tip', () => {
		const state = acceptedTipStateFromLivePreview([[0, 0, 0.5]]);
		advanceAcceptedTipState(state, { x: 5, y: 0 });
		expect(shouldAcceptStrokePageSample({ x: 12, y: 0 }, state.tip, state.prev, 10)).toBe(false);
		expect(shouldAcceptStrokePageSample({ x: 16, y: 0 }, state.tip, state.prev, 10)).toBe(true);
	});

	it('rejects small backward step', () => {
		const tip = { x: 10, y: 0 };
		const prev = { x: 0, y: 0 };
		expect(isBackwardStrokeSample({ x: 9.5, y: 0 }, tip, prev, 1)).toBe(true);
		expect(isBackwardStrokeSample({ x: 8, y: 0 }, tip, prev, 1)).toBe(false);
	});
});
