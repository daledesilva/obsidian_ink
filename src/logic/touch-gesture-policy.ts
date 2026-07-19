/** Ink-canvas touch routing modes (see FingerBlocker + ink-svg-canvas). */
export type InkTouchGestureMode =
	| 'embedNoteScroll'
	| 'dedicatedWritingVertical'
	| 'inkCanvasTwoFinger'
	/** Legacy tldraw editors without ink-canvas mode prop. */
	| 'legacy';

export type TouchAxisLock = 'none' | 'vertical' | 'horizontal';

/** Minimum movement (px) before locking dedicated-writing axis. */
export const TOUCH_AXIS_LOCK_THRESHOLD_PX = 4;

export function isVerticalDominant(deltaX: number, deltaY: number): boolean {
	return Math.abs(deltaY) >= Math.abs(deltaX);
}

export type ShouldBlockObsidianTouchParams = {
	mode: InkTouchGestureMode;
	fingerCount: 1 | 2;
	deltaX: number;
	deltaY: number;
	axisLocked: TouchAxisLock;
	/** Two-finger vertical pan mode (dedicated writing). */
	twoFingerVerticalPanActive?: boolean;
	/** Embed/dedicated drawing two-finger canvas gesture. */
	twoFingerCanvasGestureActive?: boolean;
};

/**
 * Whether this touch move should call preventDefault/stopPropagation so Obsidian does not handle it.
 */
export function shouldBlockObsidianTouch(params: ShouldBlockObsidianTouchParams): boolean {
	const {
		mode,
		fingerCount,
		deltaX,
		deltaY,
		axisLocked,
		twoFingerVerticalPanActive = false,
		twoFingerCanvasGestureActive = false,
	} = params;

	if (mode === 'embedNoteScroll' || mode === 'legacy') {
		// Legacy: vertical pan callback implies block when that path is active (handled in FingerBlocker).
		return false;
	}

	if (mode === 'inkCanvasTwoFinger') {
		return fingerCount === 2 && twoFingerCanvasGestureActive;
	}

	if (mode === 'dedicatedWritingVertical') {
		if (fingerCount === 2) {
			return twoFingerVerticalPanActive;
		}
		if (axisLocked === 'horizontal') return false;
		if (axisLocked === 'vertical') return true;
		const distance = Math.hypot(deltaX, deltaY);
		if (distance < TOUCH_AXIS_LOCK_THRESHOLD_PX) return false;
		return isVerticalDominant(deltaX, deltaY);
	}

	return false;
}

/** preventDefault alone is not enough — Obsidian command-palette swipe still fires without stopPropagation. */
export function blockObsidianTouchEvent(e: Event): void {
	e.preventDefault();
	e.stopPropagation();
	e.stopImmediatePropagation();
}

export function resolveInkTouchGestureMode(options: {
	writingMode: boolean;
	isEmbedded: boolean;
	hasDedicatedVerticalTouchPan: boolean;
}): InkTouchGestureMode {
	const { writingMode, isEmbedded, hasDedicatedVerticalTouchPan } = options;
	if (writingMode && isEmbedded) return 'embedNoteScroll';
	if (writingMode && !isEmbedded && hasDedicatedVerticalTouchPan) {
		return 'dedicatedWritingVertical';
	}
	if (!writingMode) return 'inkCanvasTwoFinger';
	return 'embedNoteScroll';
}
