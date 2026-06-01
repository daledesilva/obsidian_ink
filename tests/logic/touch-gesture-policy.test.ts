import {
	isVerticalDominant,
	shouldBlockObsidianTouch,
	resolveInkTouchGestureMode,
} from 'src/logic/touch-gesture-policy';

describe('touch-gesture-policy', () => {
	describe('isVerticalDominant', () => {
		it('returns true when |dy| >= |dx|', () => {
			expect(isVerticalDominant(0, 10)).toBe(true);
			expect(isVerticalDominant(5, 5)).toBe(true);
		});

		it('returns false when |dx| > |dy|', () => {
			expect(isVerticalDominant(10, 0)).toBe(false);
		});
	});

	describe('resolveInkTouchGestureMode', () => {
		it('returns embedNoteScroll for embedded writing', () => {
			expect(
				resolveInkTouchGestureMode({
					writingMode: true,
					isEmbedded: true,
					hasDedicatedVerticalTouchPan: false,
				}),
			).toBe('embedNoteScroll');
		});

		it('returns dedicatedWritingVertical for dedicated writing with pan callback', () => {
			expect(
				resolveInkTouchGestureMode({
					writingMode: true,
					isEmbedded: false,
					hasDedicatedVerticalTouchPan: true,
				}),
			).toBe('dedicatedWritingVertical');
		});

		it('returns inkCanvasTwoFinger for drawing', () => {
			expect(
				resolveInkTouchGestureMode({
					writingMode: false,
					isEmbedded: true,
					hasDedicatedVerticalTouchPan: false,
				}),
			).toBe('inkCanvasTwoFinger');
		});
	});

	describe('shouldBlockObsidianTouch', () => {
		it('never blocks embed note scroll', () => {
			expect(
				shouldBlockObsidianTouch({
					mode: 'embedNoteScroll',
					fingerCount: 1,
					deltaX: 0,
					deltaY: 10,
					axisLocked: 'none',
				}),
			).toBe(false);
		});

		it('blocks dedicated writing when axis locked vertical', () => {
			expect(
				shouldBlockObsidianTouch({
					mode: 'dedicatedWritingVertical',
					fingerCount: 1,
					deltaX: 0,
					deltaY: 10,
					axisLocked: 'vertical',
				}),
			).toBe(true);
		});

		it('does not block dedicated writing when axis locked horizontal', () => {
			expect(
				shouldBlockObsidianTouch({
					mode: 'dedicatedWritingVertical',
					fingerCount: 1,
					deltaX: 10,
					deltaY: 0,
					axisLocked: 'horizontal',
				}),
			).toBe(false);
		});

		it('blocks ink canvas two-finger when gesture active', () => {
			expect(
				shouldBlockObsidianTouch({
					mode: 'inkCanvasTwoFinger',
					fingerCount: 2,
					deltaX: 5,
					deltaY: 5,
					axisLocked: 'none',
					twoFingerCanvasGestureActive: true,
				}),
			).toBe(true);
		});
	});
});
