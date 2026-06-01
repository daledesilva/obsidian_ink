import * as React from 'react';
import type { Editor, TLPointerEventInfo } from '@tldraw/tldraw';

import { getPointerSamples } from 'src/ink-canvas/utils/pointer-samples';
import {
	blockObsidianTouchEvent,
	shouldBlockObsidianTouch,
	TOUCH_AXIS_LOCK_THRESHOLD_PX,
	type InkTouchGestureMode,
	type TouchAxisLock,
} from 'src/logic/touch-gesture-policy';
import './finger-blocker.scss';

const INK_CM_SCROLLER_SCROLL_PINNED_CLASS = 'ink-cm-scroller--scroll-pinned';
const INK_FINGER_BLOCKER_TOUCH_NONE_CLASS = 'ink-finger-blocker--touch-none';
const INK_FINGER_BLOCKER_TOUCH_PAN_XY_CLASS = 'ink-finger-blocker--touch-pan-xy';

function setFingerBlockerTouchMode(blockerElement: HTMLElement, mode: 'none' | 'pan-xy' | 'default') {
	blockerElement.classList.remove(INK_FINGER_BLOCKER_TOUCH_NONE_CLASS, INK_FINGER_BLOCKER_TOUCH_PAN_XY_CLASS);
	if (mode === 'none') blockerElement.classList.add(INK_FINGER_BLOCKER_TOUCH_NONE_CLASS);
	else if (mode === 'pan-xy') blockerElement.classList.add(INK_FINGER_BLOCKER_TOUCH_PAN_XY_CLASS);
}

function isDrawingPointer(e: PointerEvent): boolean {
	if (e.pointerType === 'pen') return true;
	return e.pointerType === 'mouse' && e.button === 0;
}

function isInkSvgPenTarget(target: EventTarget | null): target is SVGSVGElement {
	return target instanceof SVGSVGElement && target.classList.contains('ink-svg-canvas');
}

// Constants
const POLL_INTERVAL_MS = 100;
const MAX_POLL_RETRIES = 200; // Maximum ~20 seconds (200 * 100ms)

// Type for a tool that has pointer handlers we can wrap
interface ToolWithPointerHandlers {
	onPointerDown?: ((e: TLPointerEventInfo) => void) | undefined;
	onPointerUp?: ((e: TLPointerEventInfo) => void) | undefined;
	onPointerMove?: ((e: TLPointerEventInfo) => void) | undefined;
}

/**
 * Re-dispatch a pointer to the canvas under the overlay.
 *
 * **Plans 1 & 4 (approach A):** For `pointermove`, the caller may expand browser coalesced
 * samples into several synthetics (`sample` from {@link getPointerSamples}, `coalescingParent`
 * = the captured `pointermove`). Synthetic events do not expose `getCoalescedEvents()`, so the
 * ink draw tool must treat each dispatch as one logical sample (it still calls
 * {@link getPointerSamples}, which returns `[e]` for synthetics — no double expansion).
 */
function forwardPointerEvent(
	target: EventTarget,
	type: string,
	sample: PointerEvent,
	coalescingParent?: PointerEvent,
): void {
	const meta = coalescingParent ?? sample;
	const isCoalescedSample = coalescingParent !== undefined;

	const pressure = isCoalescedSample
		? sample.pressure > 0
			? sample.pressure
			: coalescingParent.pressure > 0
				? coalescingParent.pressure
				: 0.5
		: sample.pressure;

	const width =
		isCoalescedSample && sample.width <= 0 ? coalescingParent.width : sample.width;
	const height =
		isCoalescedSample && sample.height <= 0 ? coalescingParent.height : sample.height;

	target.dispatchEvent(
		new PointerEvent(type, {
			pointerId: meta.pointerId,
			pointerType: meta.pointerType,
			clientX: sample.clientX,
			clientY: sample.clientY,
			bubbles: true,
			cancelable: true,
			view: window,
			detail: meta.detail,
			screenX: sample.screenX,
			screenY: sample.screenY,
			ctrlKey: meta.ctrlKey,
			shiftKey: meta.shiftKey,
			altKey: meta.altKey,
			metaKey: meta.metaKey,
			button: meta.button,
			buttons: meta.buttons,
			pressure,
			width,
			height,
		}),
	);
}

export type FingerBlockerProps = {
	/** Legacy tldraw editors only. Ink canvas embeds omit this. */
	getTlEditor?: () => Editor | undefined;
	wrapperRef?: React.RefObject<HTMLDivElement>;
	/**
	 * When true, FingerBlocker will detect two-finger touch gestures on embedded drawing
	 * editors (tldraw camera or ink-canvas via onDrawingEmbedTwoFingerGesture).
	 */
	enableTwoFingerGestures?: boolean;
	/**
	 * When set (dedicated writing view), single- and two-finger vertical touch pans invoke
	 * this callback instead of native .cm-scroller scroll or pinch-zoom.
	 */
	onVerticalTouchPan?: (deltaY: number) => void;
	/** Ink canvas: when false, pen still locks note scroll but is not forwarded (Boox). */
	forwardPenToCanvas?: boolean;
	/** Ink canvas embedded drawing: two-finger pan/zoom on the ink canvas. */
	onDrawingEmbedTwoFingerGesture?: (params: {
		deltaX: number;
		deltaY: number;
		anchorX: number;
		anchorY: number;
		distanceRatio: number;
	}) => void;
	/** Fired when a two-finger embed gesture ends (reposition Boox overlay). */
	onEmbedTwoFingerGestureEnd?: () => void;
	/** Fired when a touch pan gesture fully ends (e.g. start flick momentum). */
	onPanGestureEnd?: () => void;
	/** When true, middle-click (button 1) is forwarded to ink-svg-canvas for temporary erase. */
	enableMiddleButtonTemporaryErase?: boolean;
	/**
	 * Ink-canvas touch routing. When omitted, legacy tldraw behavior (enableTwoFingerGestures +
	 * onVerticalTouchPan) applies unchanged.
	 */
	touchGestureMode?: InkTouchGestureMode;
	/** Called when a touch session begins that may capture pan/scroll (cancel in-flight momentum). */
	onTouchGestureSessionStart?: () => void;
};

export function FingerBlocker({
	getTlEditor,
	wrapperRef,
	enableTwoFingerGestures,
	onVerticalTouchPan,
	forwardPenToCanvas = true,
	onDrawingEmbedTwoFingerGesture,
	onEmbedTwoFingerGestureEnd,
	onPanGestureEnd,
	enableMiddleButtonTemporaryErase = false,
	touchGestureMode = 'legacy',
	onTouchGestureSessionStart,
}: FingerBlockerProps) {
	const blockerRef = React.useRef<HTMLDivElement>(null);
	const pointerDownRef = React.useRef<boolean>(false);
	const recentPenInputRef = React.useRef<boolean>(false);

	// Refs for scroll pinning strategy
	const isPenDownRef = React.useRef<boolean>(false);
	const lockedScrollPosRef = React.useRef<{ x: number; y: number } | null>(null);
	const activeScrollerRef = React.useRef<HTMLElement | null>(null);

	// Refs for tracking tldraw tool handlers
	const currentTldrawToolIdRef = React.useRef<string | null>(null);
	const tldrawToolCleanupMap = React.useRef<Map<string, () => void>>(new Map());

	// Refs for two-finger gesture mode (only active when enableTwoFingerGestures is true)
	const activeTouchPointerDataRef = React.useRef<Map<number, {
		pointerId: number;
		clientX: number;
		clientY: number;
		screenX: number;
		screenY: number;
		width: number;
		height: number;
		pressure: number;
	}>>(new Map());
	const twoFingerModeActiveRef = React.useRef(false);
	const prevTwoFingerMidpointRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });
	const prevTwoFingerDistanceRef = React.useRef<number>(0);
	// Captures the camera's isLocked state before a two-finger gesture unlocks it, so it
	// can be restored when the gesture ends (preserves free camera in dedicated views).
	const prevCameraLockedRef = React.useRef(false);

	// Dedicated writing view: vertical touch pan (single- or two-finger), distinct from pinch-zoom.
	const twoFingerVerticalPanActiveRef = React.useRef(false);
	const prevVerticalPanMidpointRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });
	const prevSingleFingerVerticalPanClientYByPointerRef = React.useRef<Map<number, number>>(new Map());
	const onVerticalTouchPanRef = React.useRef(onVerticalTouchPan);
	const onDrawingEmbedTwoFingerGestureRef = React.useRef(onDrawingEmbedTwoFingerGesture);
	const onEmbedTwoFingerGestureEndRef = React.useRef(onEmbedTwoFingerGestureEnd);
	const onPanGestureEndRef = React.useRef(onPanGestureEnd);
	const onTouchGestureSessionStartRef = React.useRef(onTouchGestureSessionStart);
	React.useEffect(() => {
		onTouchGestureSessionStartRef.current = onTouchGestureSessionStart;
	}, [onTouchGestureSessionStart]);
	const touchGestureModeRef = React.useRef(touchGestureMode);
	touchGestureModeRef.current = touchGestureMode;
	const touchGestureSessionActiveRef = React.useRef(false);
	const dedicatedWritingAxisLockedRef = React.useRef<TouchAxisLock>('none');
	const dedicatedWritingGestureStartClientRef = React.useRef<Map<number, { x: number; y: number }>>(new Map());
	/** True when dedicated writing consumed vertical pan (for flick on gesture end). */
	const verticalPanConsumedRef = React.useRef(false);
	/** Right-click embed pan/zoom pointers forwarded to ink-svg-canvas (capture may fail on synthetics). */
	const embedPanZoomPointerIdsRef = React.useRef<Set<number>>(new Set());
	/** Middle-click temporary-erase pointers forwarded to ink-svg-canvas. */
	const middleButtonErasePointerIdsRef = React.useRef<Set<number>>(new Set());
	const enableMiddleButtonTemporaryEraseRef = React.useRef(enableMiddleButtonTemporaryErase);
	enableMiddleButtonTemporaryEraseRef.current = enableMiddleButtonTemporaryErase;
	React.useEffect(() => {
		onVerticalTouchPanRef.current = onVerticalTouchPan;
	}, [onVerticalTouchPan]);
	React.useEffect(() => {
		onDrawingEmbedTwoFingerGestureRef.current = onDrawingEmbedTwoFingerGesture;
	}, [onDrawingEmbedTwoFingerGesture]);
	React.useEffect(() => {
		onEmbedTwoFingerGestureEndRef.current = onEmbedTwoFingerGestureEnd;
	}, [onEmbedTwoFingerGestureEnd]);
	React.useEffect(() => {
		onPanGestureEndRef.current = onPanGestureEnd;
	}, [onPanGestureEnd]);

	// Helper functions
	const getWrapper = (): HTMLDivElement | null => {
		return (
			wrapperRef?.current ||
			(blockerRef.current?.parentElement as HTMLDivElement | null) ||
			null
		);
	};

	/** Pen target: ink-svg-canvas (current) or .tl-canvas (legacy tldraw). */
	const getPenForwardTarget = (): EventTarget | null => {
		const wrapper = getWrapper();
		if (!wrapper) return null;
		return wrapper.querySelector('.ink-svg-canvas') ?? wrapper.querySelector('.tl-canvas');
	};

	const getScroller = (): HTMLElement | null => {
		const wrapper = getWrapper();
		return wrapper ? (wrapper.closest('.cm-scroller')) : null;
	};

	const lockScroll = () => {
		const scroller = getScroller();
		if (scroller) {
			// Ref-based state tracking for scroll restoration
			activeScrollerRef.current = scroller;
			lockedScrollPosRef.current = { x: scroller.scrollLeft, y: scroller.scrollTop };
			scroller.classList.add(INK_CM_SCROLLER_SCROLL_PINNED_CLASS);
		}
	};

	const clearScrollerPin = (scroller: HTMLElement) => {
		scroller.classList.remove(INK_CM_SCROLLER_SCROLL_PINNED_CLASS);
		scroller.style.overflow = 'auto';
		window.setTimeout(() => {
			scroller.style.scrollbarColor = 'auto';
		}, 200);
	};

	const unlockScroll = () => {
		if (isPenDownRef.current) {
			isPenDownRef.current = false;
			if (activeScrollerRef.current) {
				clearScrollerPin(activeScrollerRef.current);
				activeScrollerRef.current = null;
			}
			lockedScrollPosRef.current = null;
		} else {
			const scroller = getScroller();
			if (scroller) {
				clearScrollerPin(scroller);
			}
		}
	};

	const closeKeyboard = () => {
		const active = document.activeElement as HTMLElement | null;
		if (
			active
			&& !active.classList.contains('tl-canvas')
			&& !active.classList.contains('ink-svg-canvas')
		) {
			active.blur();
		}
	};

	// Setup native event listeners to aggressively prevent default behavior for pen/mouse
	React.useEffect(() => {
		const element = blockerRef.current;
		if (!element) return;

		const isEmbedDrawingInkCanvas = () => !!onDrawingEmbedTwoFingerGestureRef.current;

		const isDedicatedWritingVerticalMode = () =>
			touchGestureModeRef.current === 'dedicatedWritingVertical'
			&& !!onVerticalTouchPanRef.current;

		const isInkCanvasTwoFingerMode = () =>
			touchGestureModeRef.current === 'inkCanvasTwoFinger'
			|| (!!enableTwoFingerGestures && touchGestureModeRef.current === 'legacy');

		const shouldForwardEmbedRightButtonToCanvas = () => isEmbedDrawingInkCanvas();

		const resetDedicatedWritingGestureState = () => {
			dedicatedWritingAxisLockedRef.current = 'none';
			dedicatedWritingGestureStartClientRef.current.clear();
			verticalPanConsumedRef.current = false;
		};

		const beginTouchGestureSession = () => {
			if (!touchGestureSessionActiveRef.current) {
				onTouchGestureSessionStartRef.current?.();
			}
			touchGestureSessionActiveRef.current = true;
		};

		const updateDedicatedWritingAxisLock = (pointerId: number, clientX: number, clientY: number) => {
			if (dedicatedWritingAxisLockedRef.current !== 'none') return;
			const start = dedicatedWritingGestureStartClientRef.current.get(pointerId);
			if (!start) return;
			const deltaX = clientX - start.x;
			const deltaY = clientY - start.y;
			if (Math.hypot(deltaX, deltaY) < TOUCH_AXIS_LOCK_THRESHOLD_PX) return;
			dedicatedWritingAxisLockedRef.current = Math.abs(deltaY) >= Math.abs(deltaX)
				? 'vertical'
				: 'horizontal';
			if (dedicatedWritingAxisLockedRef.current === 'vertical') {
				setFingerBlockerTouchMode(element, 'none');
			}
		};

		const isEmbedPanZoomMouseButton = (e: PointerEvent) =>
			e.pointerType === 'mouse' && e.button === 2;

		const isMiddleButtonTemporaryEraseMouseButton = (e: PointerEvent) =>
			e.pointerType === 'mouse' && e.button === 1;

		const handlePointerDown = (e: PointerEvent) => {
			if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
				// Let browser back/forward mouse buttons (3 & 4) pass through so
				// Obsidian's history navigation is not intercepted.
				if (e.pointerType === 'mouse' && (e.button === 3 || e.button === 4)) return;

				// Only lock scroll for left-click (button 0) and pen input.
				// Middle (button 1) temporary erase and right (button 2) embed pan/zoom call
				// tlContainer.setPointerCapture() — transferring native capture away from
				// this element. Because setPointerCapture() on a synthetic forwarded event
				// doesn't reliably fire lostpointercapture on this element in Electron/Chromium,
				// the simplest safe approach is to never lock scroll for non-primary buttons.
				const isDrawingInput = e.pointerType === 'pen' || e.button === 0;
				if (isDrawingInput) {
					lockScroll();
					isPenDownRef.current = true;
				}

				// Dynamically prevent touch gestures for Pen (keep this as backup)
				setFingerBlockerTouchMode(element, 'none');

				// Aggressively stop browser handling (scrolling/selection)
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();

				const target = e.target as HTMLElement;
				try {
					target.setPointerCapture(e.pointerId);
				} catch (err) {
					// Ignore if capture fails
				}

				const penTarget = getPenForwardTarget();
				if (penTarget && forwardPenToCanvas && isDrawingInput) {
					forwardPointerEvent(penTarget, 'pointerdown', e);
				}
				if (penTarget && shouldForwardEmbedRightButtonToCanvas() && isEmbedPanZoomMouseButton(e)) {
					embedPanZoomPointerIdsRef.current.add(e.pointerId);
					forwardPointerEvent(penTarget, 'pointerdown', e);
				}
				if (
					penTarget
					&& enableMiddleButtonTemporaryEraseRef.current
					&& isMiddleButtonTemporaryEraseMouseButton(e)
				) {
					middleButtonErasePointerIdsRef.current.add(e.pointerId);
					forwardPointerEvent(penTarget, 'pointerdown', e);
				}
				if (isDrawingInput) {
					recentPenInputRef.current = true;
				}
			} else if (e.pointerType === 'touch') {
				// Track this touch pointer's coordinates for potential two-finger forwarding
				activeTouchPointerDataRef.current.set(e.pointerId, {
					pointerId: e.pointerId,
					clientX: e.clientX,
					clientY: e.clientY,
					screenX: e.screenX,
					screenY: e.screenY,
					width: e.width,
					height: e.height,
					pressure: e.pressure,
				});
				const touchCount = activeTouchPointerDataRef.current.size;
				const verticalTouchPan = onVerticalTouchPanRef.current;
				const dedicatedWritingVertical = isDedicatedWritingVerticalMode();

				if (dedicatedWritingVertical) {
					beginTouchGestureSession();
					resetDedicatedWritingGestureState();
					if (touchCount >= 2 && !twoFingerVerticalPanActiveRef.current) {
						blockObsidianTouchEvent(e);
						setFingerBlockerTouchMode(element, 'none');
						twoFingerVerticalPanActiveRef.current = true;
						const [pa, pb] = [...activeTouchPointerDataRef.current.values()];
						prevVerticalPanMidpointRef.current = {
							x: (pa.clientX + pb.clientX) / 2,
							y: (pa.clientY + pb.clientY) / 2,
						};
					} else if (touchCount === 1) {
						setFingerBlockerTouchMode(element, 'pan-xy');
						dedicatedWritingGestureStartClientRef.current.set(e.pointerId, {
							x: e.clientX,
							y: e.clientY,
						});
						prevSingleFingerVerticalPanClientYByPointerRef.current.set(e.pointerId, e.clientY);
					}
				} else if (verticalTouchPan) {
					// Legacy tldraw dedicated writing: block all touch immediately.
					beginTouchGestureSession();
					blockObsidianTouchEvent(e);
					setFingerBlockerTouchMode(element, 'none');

					if (touchCount >= 2 && !twoFingerVerticalPanActiveRef.current) {
						twoFingerVerticalPanActiveRef.current = true;
						const [pa, pb] = [...activeTouchPointerDataRef.current.values()];
						prevVerticalPanMidpointRef.current = {
							x: (pa.clientX + pb.clientX) / 2,
							y: (pa.clientY + pb.clientY) / 2,
						};
					} else if (touchCount === 1) {
						prevSingleFingerVerticalPanClientYByPointerRef.current.set(e.pointerId, e.clientY);
					}
				} else if (touchCount >= 2 && isInkCanvasTwoFingerMode() && !twoFingerModeActiveRef.current) {
					beginTouchGestureSession();
					// Switch from single-finger scroll mode to two-finger gesture mode.
					blockObsidianTouchEvent(e);
					setFingerBlockerTouchMode(element, 'none');
					twoFingerModeActiveRef.current = true;

					const inkTwoFinger = onDrawingEmbedTwoFingerGestureRef.current;
					const editorForLock = getTlEditor?.();
					if (inkTwoFinger) {
						const [pa, pb] = [...activeTouchPointerDataRef.current.values()];
						prevTwoFingerMidpointRef.current = {
							x: (pa.clientX + pb.clientX) / 2,
							y: (pa.clientY + pb.clientY) / 2,
						};
						prevTwoFingerDistanceRef.current = Math.hypot(pb.clientX - pa.clientX, pb.clientY - pa.clientY);
					} else if (editorForLock) {
						// Capture the camera's current lock state so it can be restored when
						// the gesture ends — preserves free camera in dedicated views.
						prevCameraLockedRef.current = editorForLock.getCameraOptions().isLocked;
						editorForLock.setCameraOptions({ isLocked: false });

						const [pa, pb] = [...activeTouchPointerDataRef.current.values()];
						const containerRect = editorForLock.getContainer().getBoundingClientRect();
						prevTwoFingerMidpointRef.current = {
							x: (pa.clientX + pb.clientX) / 2 - containerRect.left,
							y: (pa.clientY + pb.clientY) / 2 - containerRect.top,
						};
						prevTwoFingerDistanceRef.current = Math.hypot(pb.clientX - pa.clientX, pb.clientY - pa.clientY);
					}
				} else if (!twoFingerModeActiveRef.current) {
					// Single finger: let the browser handle scrolling
					setFingerBlockerTouchMode(element, 'pan-xy');
				}
			}
		};

		const endInkPenSession = (e: PointerEvent) => {
			if (!isDrawingPointer(e)) return;
			setFingerBlockerTouchMode(element, 'default');
			unlockScroll();
		};

		const handlePointerMove = (e: PointerEvent) => {
			if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();

				// Re-assert scroll lock if needed.
				// ie. If it was the first pen stroke since a touch, it was locked too late, so do it again.
				if (isPenDownRef.current && activeScrollerRef.current && lockedScrollPosRef.current) {
					const scroller = activeScrollerRef.current;
					if (Math.abs(scroller.scrollTop - lockedScrollPosRef.current.y) > 1 || 
						Math.abs(scroller.scrollLeft - lockedScrollPosRef.current.x) > 1) {
						scroller.scrollTo(lockedScrollPosRef.current.x, lockedScrollPosRef.current.y);
					}
				}

				const penTarget = getPenForwardTarget();
				if (penTarget && forwardPenToCanvas && isDrawingPointer(e)) {
					const moveSamples = getPointerSamples(e);
					for (const sample of moveSamples) {
						// Same reference as the captured move: preserve original pressure/width semantics.
						if (sample === e) {
							forwardPointerEvent(penTarget, 'pointermove', sample);
						} else {
							forwardPointerEvent(penTarget, 'pointermove', sample, e);
						}
					}
				} else if (penTarget && embedPanZoomPointerIdsRef.current.has(e.pointerId)) {
					forwardPointerEvent(penTarget, 'pointermove', e);
				} else if (penTarget && middleButtonErasePointerIdsRef.current.has(e.pointerId)) {
					forwardPointerEvent(penTarget, 'pointermove', e);
				}
			} else if (e.pointerType === 'touch' && twoFingerVerticalPanActiveRef.current) {
				const existing = activeTouchPointerDataRef.current.get(e.pointerId);
				if (!existing) return;
				activeTouchPointerDataRef.current.set(e.pointerId, {
					...existing,
					clientX: e.clientX,
					clientY: e.clientY,
					screenX: e.screenX,
					screenY: e.screenY,
				});

				if (activeTouchPointerDataRef.current.size < 2) return;

				const [p0, p1] = [...activeTouchPointerDataRef.current.values()];
				const currentMidpoint = {
					x: (p0.clientX + p1.clientX) / 2,
					y: (p0.clientY + p1.clientY) / 2,
				};
				const prevMidpoint = prevVerticalPanMidpointRef.current;
				const deltaX = currentMidpoint.x - prevMidpoint.x;
				const deltaY = currentMidpoint.y - prevMidpoint.y;

				blockObsidianTouchEvent(e);

				if (Math.abs(deltaY) >= Math.abs(deltaX)) {
					verticalPanConsumedRef.current = true;
					// Negate so finger-up scrolls down (matches embed .cm-scroller semantics, not wheel sign).
					onVerticalTouchPanRef.current?.(-deltaY);
				}
				prevVerticalPanMidpointRef.current = currentMidpoint;
			} else if (
				e.pointerType === 'touch'
				&& onVerticalTouchPanRef.current
				&& !twoFingerVerticalPanActiveRef.current
			) {
				recentPenInputRef.current = false;

				if (isDedicatedWritingVerticalMode()) {
					updateDedicatedWritingAxisLock(e.pointerId, e.clientX, e.clientY);
					const axisLocked = dedicatedWritingAxisLockedRef.current;
					const start = dedicatedWritingGestureStartClientRef.current.get(e.pointerId);
					const deltaX = start ? e.clientX - start.x : 0;
					const deltaY = start ? e.clientY - start.y : 0;
					const shouldBlock = shouldBlockObsidianTouch({
						mode: 'dedicatedWritingVertical',
						fingerCount: 1,
						deltaX,
						deltaY,
						axisLocked,
					});
					if (!shouldBlock) return;

					blockObsidianTouchEvent(e);
					const prevClientY = prevSingleFingerVerticalPanClientYByPointerRef.current.get(e.pointerId);
					if (prevClientY === undefined) {
						prevSingleFingerVerticalPanClientYByPointerRef.current.set(e.pointerId, e.clientY);
					} else {
						const frameDeltaY = e.clientY - prevClientY;
						prevSingleFingerVerticalPanClientYByPointerRef.current.set(e.pointerId, e.clientY);
						if (frameDeltaY !== 0) {
							verticalPanConsumedRef.current = true;
							onVerticalTouchPanRef.current!(-frameDeltaY);
						}
					}
					return;
				}

				blockObsidianTouchEvent(e);
				const prevClientY = prevSingleFingerVerticalPanClientYByPointerRef.current.get(e.pointerId);
				if (prevClientY === undefined) {
					prevSingleFingerVerticalPanClientYByPointerRef.current.set(e.pointerId, e.clientY);
				} else {
					const deltaY = e.clientY - prevClientY;
					prevSingleFingerVerticalPanClientYByPointerRef.current.set(e.pointerId, e.clientY);
					if (deltaY !== 0) {
						onVerticalTouchPanRef.current(-deltaY);
					}
				}
			} else if (e.pointerType === 'touch' && recentPenInputRef.current) {
				// Embed: first finger touch after pen — scroll was unlocked too late, so scroll manually.
				const scroller = getScroller();
				if (scroller) {
					scroller.scrollTo({
						top: scroller.scrollTop - e.movementY,
						left: scroller.scrollLeft - e.movementX,
					});
				}
			} else if (e.pointerType === 'touch' && twoFingerModeActiveRef.current) {
				// Update this pointer's stored position so we always use the latest coordinates.
				const existing = activeTouchPointerDataRef.current.get(e.pointerId);
				if (!existing) return;
				activeTouchPointerDataRef.current.set(e.pointerId, {
					...existing,
					clientX: e.clientX,
					clientY: e.clientY,
					screenX: e.screenX,
					screenY: e.screenY,
				});

				if (activeTouchPointerDataRef.current.size < 2) return;

				blockObsidianTouchEvent(e);

				const [p0, p1] = [...activeTouchPointerDataRef.current.values()];
				const inkTwoFinger = onDrawingEmbedTwoFingerGestureRef.current;
				const curDist = Math.hypot(p1.clientX - p0.clientX, p1.clientY - p0.clientY);
				const pm = prevTwoFingerMidpointRef.current;
				const prevDist = prevTwoFingerDistanceRef.current;
				const ratio = prevDist > 0 ? curDist / prevDist : 1;

				if (inkTwoFinger) {
					const wrapper = getWrapper();
					const containerRect = wrapper?.getBoundingClientRect() ?? new DOMRect();
					const newMidClient = {
						x: (p0.clientX + p1.clientX) / 2,
						y: (p0.clientY + p1.clientY) / 2,
					};
					inkTwoFinger({
						deltaX: newMidClient.x - pm.x,
						deltaY: newMidClient.y - pm.y,
						anchorX: newMidClient.x - containerRect.left,
						anchorY: newMidClient.y - containerRect.top,
						distanceRatio: ratio,
					});
					prevTwoFingerMidpointRef.current = newMidClient;
					prevTwoFingerDistanceRef.current = curDist;
				} else {
					const editor = getTlEditor?.();
					if (!editor) return;
					const containerRect = editor.getContainer().getBoundingClientRect();
					const cm = {
						x: (p0.clientX + p1.clientX) / 2 - containerRect.left,
						y: (p0.clientY + p1.clientY) / 2 - containerRect.top,
					};
					const factor = ratio;
					const { x: cx, y: cy, z: cz } = editor.getCamera();
					const { zoomSteps } = editor.getCameraOptions();
					const newZ = Math.max(zoomSteps[0], Math.min(zoomSteps[zoomSteps.length - 1], cz * factor));
					const newCx = cx + cm.x / newZ - pm.x / cz;
					const newCy = cy + cm.y / newZ - pm.y / cz;
					editor.setCamera({ x: newCx, y: newCy, z: newZ }, { animation: { duration: 0 } });
					prevTwoFingerMidpointRef.current = cm;
					prevTwoFingerDistanceRef.current = curDist;
				}
			}
		};

		const handlePointerUp = (e: PointerEvent) => {
			if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
				const penTarget = getPenForwardTarget();
				if (penTarget && forwardPenToCanvas && isDrawingPointer(e)) {
					forwardPointerEvent(penTarget, 'pointerup', e);
				}
				if (penTarget && embedPanZoomPointerIdsRef.current.has(e.pointerId)) {
					forwardPointerEvent(penTarget, 'pointerup', e);
					embedPanZoomPointerIdsRef.current.delete(e.pointerId);
				}
				if (penTarget && middleButtonErasePointerIdsRef.current.has(e.pointerId)) {
					forwardPointerEvent(penTarget, 'pointerup', e);
					middleButtonErasePointerIdsRef.current.delete(e.pointerId);
				}

				setFingerBlockerTouchMode(element, 'default');
				unlockScroll();
				
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				
				const target = e.target as HTMLElement;
				if (target.hasPointerCapture(e.pointerId)) {
					try {
						target.releasePointerCapture(e.pointerId);
					} catch (err) {
						// Ignore
					}
				}
			} else if (e.pointerType === 'touch') {
				activeTouchPointerDataRef.current.delete(e.pointerId);
				// Keep recentPenInputRef until all fingers lift (touchend below) so post-pen scroll works on iOS.
				if (activeTouchPointerDataRef.current.size === 0) {
					recentPenInputRef.current = false;
				}

				if (onVerticalTouchPanRef.current) {
					prevSingleFingerVerticalPanClientYByPointerRef.current.delete(e.pointerId);
					dedicatedWritingGestureStartClientRef.current.delete(e.pointerId);
					if (twoFingerVerticalPanActiveRef.current && activeTouchPointerDataRef.current.size < 2) {
						twoFingerVerticalPanActiveRef.current = false;
						dedicatedWritingAxisLockedRef.current = 'none';
						for (const touch of activeTouchPointerDataRef.current.values()) {
							prevSingleFingerVerticalPanClientYByPointerRef.current.set(
								touch.pointerId,
								touch.clientY,
							);
							dedicatedWritingGestureStartClientRef.current.set(touch.pointerId, {
								x: touch.clientX,
								y: touch.clientY,
							});
						}
					}
					if (activeTouchPointerDataRef.current.size === 0) {
						setFingerBlockerTouchMode(element, 'default');
					} else if (!isDedicatedWritingVerticalMode() || twoFingerVerticalPanActiveRef.current) {
						setFingerBlockerTouchMode(element, 'none');
					}
				}
				// Camera re-locking when the gesture ends is handled by the touchend listener
				// below, since tldraw may have captured these pointer IDs (preventing
				// pointerup from reliably reaching FingerBlocker for captured pointers).
			}
		};

		const handlePointerCancel = (e: PointerEvent) => {
			setFingerBlockerTouchMode(element, 'default');

			if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
				const penTarget = getPenForwardTarget();
				if (penTarget && forwardPenToCanvas && isDrawingPointer(e)) {
					forwardPointerEvent(penTarget, 'pointercancel', e);
				}
				if (penTarget && embedPanZoomPointerIdsRef.current.has(e.pointerId)) {
					forwardPointerEvent(penTarget, 'pointercancel', e);
					embedPanZoomPointerIdsRef.current.delete(e.pointerId);
				}
				if (penTarget && middleButtonErasePointerIdsRef.current.has(e.pointerId)) {
					forwardPointerEvent(penTarget, 'pointercancel', e);
					middleButtonErasePointerIdsRef.current.delete(e.pointerId);
				}
				unlockScroll();

				const target = e.target as HTMLElement;
				if (target.hasPointerCapture(e.pointerId)) {
					try {
						target.releasePointerCapture(e.pointerId);
					} catch (err) {
						// Ignore
					}
				}
			} else if (e.pointerType === 'touch') {
				activeTouchPointerDataRef.current.delete(e.pointerId);
				if (onVerticalTouchPanRef.current) {
					prevSingleFingerVerticalPanClientYByPointerRef.current.delete(e.pointerId);
					dedicatedWritingGestureStartClientRef.current.delete(e.pointerId);
					twoFingerVerticalPanActiveRef.current = false;
					resetDedicatedWritingGestureState();
					if (activeTouchPointerDataRef.current.size === 0) {
						setFingerBlockerTouchMode(element, 'default');
						touchGestureSessionActiveRef.current = false;
					}
				}
			}
		};

		const handleWheel = (e: WheelEvent) => {
			if (isPenDownRef.current) {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				return;
			}
			if (isEmbedDrawingInkCanvas() && (e.ctrlKey || e.metaKey)) {
				const penTarget = getPenForwardTarget();
				if (penTarget) {
					penTarget.dispatchEvent(new WheelEvent('wheel', {
						deltaX: e.deltaX,
						deltaY: e.deltaY,
						deltaZ: e.deltaZ,
						deltaMode: e.deltaMode,
						clientX: e.clientX,
						clientY: e.clientY,
						screenX: e.screenX,
						screenY: e.screenY,
						ctrlKey: e.ctrlKey,
						metaKey: e.metaKey,
						shiftKey: e.shiftKey,
						altKey: e.altKey,
						bubbles: true,
						cancelable: true,
					}));
					// preventDefault only — never stopPropagation (breaks OS scroll on macOS).
					e.preventDefault();
				}
			}
		};

		// Ink canvas reserves right-click for pan/zoom/erase; never show the note context menu.
		const suppressEmbedContextMenu = (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
		};

		const handleTouchMove = (e: TouchEvent) => {
			if (isPenDownRef.current || twoFingerModeActiveRef.current) {
				blockObsidianTouchEvent(e);
				return;
			}

			if (!touchGestureSessionActiveRef.current) return;

			const mode = touchGestureModeRef.current;
			if (mode === 'embedNoteScroll') return;

			if (mode === 'inkCanvasTwoFinger' && twoFingerModeActiveRef.current) {
				blockObsidianTouchEvent(e);
				return;
			}

			if (isDedicatedWritingVerticalMode() || (mode === 'legacy' && onVerticalTouchPanRef.current)) {
				if (twoFingerVerticalPanActiveRef.current) {
					blockObsidianTouchEvent(e);
					return;
				}
				if (mode === 'legacy' && onVerticalTouchPanRef.current) {
					blockObsidianTouchEvent(e);
					return;
				}
				if (isDedicatedWritingVerticalMode()) {
					const axisLocked = dedicatedWritingAxisLockedRef.current;
					if (axisLocked === 'vertical') {
						blockObsidianTouchEvent(e);
					}
					// horizontal: do not block — Obsidian receives touchmove
				}
			}
		};

		// When an embed pan/zoom gesture calls tlContainer.setPointerCapture(), pointer
		// capture transfers away from this element. The browser fires lostpointercapture
		// here, but pointerup never arrives — so unlockScroll() would never be called and
		// the scroll-pinning mechanism (isPenDownRef + handleScroll) would stay active
		// indefinitely, blocking all scroll attempts even after the gesture ends.
		const handleLostPointerCapture = () => {
			if (!isPenDownRef.current) return;
			unlockScroll();
		};

		// Re-lock tldraw camera when a two-finger gesture ends.
		// Touch Events (touchend/touchcancel) are NOT affected by Pointer Events capture,
		// so this fires reliably even when tldraw has captured the touch pointer IDs via
		// our synthetic pointerdowns in the two-finger activation path above.
		const handleTouchEnd = (e: TouchEvent) => {
			// Keep activeTouchPointerDataRef in sync (Touch Events use .identifier which
			// corresponds to pointerId on all major browsers for touch input)
			Array.from(e.changedTouches).forEach((touch) => {
				activeTouchPointerDataRef.current.delete(touch.identifier);
			});

			if (onVerticalTouchPanRef.current) {
				if (twoFingerVerticalPanActiveRef.current && e.touches.length < 2) {
					twoFingerVerticalPanActiveRef.current = false;
					dedicatedWritingAxisLockedRef.current = 'none';
				}
				if (e.touches.length === 0) {
					setFingerBlockerTouchMode(element, 'default');
					activeTouchPointerDataRef.current.clear();
					touchGestureSessionActiveRef.current = false;
					const shouldReleaseMomentum = isDedicatedWritingVerticalMode()
						? verticalPanConsumedRef.current
						: true;
					if (shouldReleaseMomentum) {
						onPanGestureEndRef.current?.();
					}
					resetDedicatedWritingGestureState();
				}
				return;
			}

			if (!isInkCanvasTwoFingerMode()) return;

			if (twoFingerModeActiveRef.current && e.touches.length < 2) {
				if (!onDrawingEmbedTwoFingerGestureRef.current) {
					getTlEditor?.()?.setCameraOptions({ isLocked: prevCameraLockedRef.current });
				}
				twoFingerModeActiveRef.current = false;
				if (onDrawingEmbedTwoFingerGestureRef.current) {
					onEmbedTwoFingerGestureEndRef.current?.();
				}
			}
			if (e.touches.length === 0) {
				setFingerBlockerTouchMode(element, 'default');
				activeTouchPointerDataRef.current.clear();
				touchGestureSessionActiveRef.current = false;
				recentPenInputRef.current = false;
			}
		};

		// Add listeners with passive: false to ensure preventDefault works
		element.addEventListener('pointerdown', handlePointerDown, { passive: false, capture: true });
		element.addEventListener('pointermove', handlePointerMove, { passive: false, capture: true });
		element.addEventListener('pointerup', handlePointerUp, { passive: false, capture: true });
		element.addEventListener('pointercancel', handlePointerCancel, { passive: false, capture: true });
		element.addEventListener('lostpointercapture', handleLostPointerCapture);
		element.addEventListener('wheel', handleWheel, { passive: false, capture: true });
		element.addEventListener('contextmenu', suppressEmbedContextMenu, { capture: true });
		element.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
		element.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });
		element.addEventListener('touchcancel', handleTouchEnd, { passive: true, capture: true });

		// Ink canvas captures the pen on pointerdown, so pointerup often never reaches this overlay.
		// release_0.5 unlocks via tldraw tool wraps; ink-svg-canvas needs end listeners on the SVG.
		const inkSvg = getPenForwardTarget();
		const inkPenEndOpts: AddEventListenerOptions = { capture: true };
		// Always listen on ink-svg-canvas: Boox sets forwardPenToCanvas=false but pen capture
		// on the SVG still requires unlockScroll when pointerup arrives there.
		if (isInkSvgPenTarget(inkSvg)) {
			inkSvg.addEventListener('pointerup', endInkPenSession, inkPenEndOpts);
			inkSvg.addEventListener('pointercancel', endInkPenSession, inkPenEndOpts);
		}

		return () => {
			isPenDownRef.current = false;
			embedPanZoomPointerIdsRef.current.clear();
			middleButtonErasePointerIdsRef.current.clear();
			touchGestureSessionActiveRef.current = false;
			resetDedicatedWritingGestureState();
			unlockScroll();
			element.removeEventListener('pointerdown', handlePointerDown, { capture: true });
			element.removeEventListener('pointermove', handlePointerMove, { capture: true });
			element.removeEventListener('pointerup', handlePointerUp, { capture: true });
			element.removeEventListener('pointercancel', handlePointerCancel, { capture: true });
			element.removeEventListener('lostpointercapture', handleLostPointerCapture);
			element.removeEventListener('wheel', handleWheel, { capture: true });
			element.removeEventListener('contextmenu', suppressEmbedContextMenu, { capture: true });
			element.removeEventListener('touchmove', handleTouchMove, { capture: true });
			element.removeEventListener('touchend', handleTouchEnd, { capture: true });
			element.removeEventListener('touchcancel', handleTouchEnd, { capture: true });
			if (isInkSvgPenTarget(inkSvg)) {
				inkSvg.removeEventListener('pointerup', endInkPenSession, inkPenEndOpts);
				inkSvg.removeEventListener('pointercancel', endInkPenSession, inkPenEndOpts);
			}
		};
	}, [forwardPenToCanvas, enableTwoFingerGestures, onVerticalTouchPan, touchGestureMode]);

	// Add scroll restoration listener to the scroller itself
	React.useEffect(() => {
		const scroller = getScroller();
		if (!scroller) return;

		const handleScroll = (e: Event) => {
			if (isPenDownRef.current && lockedScrollPosRef.current) {
				// Force restoration
				if (Math.abs(scroller.scrollTop - lockedScrollPosRef.current.y) > 1 || 
					Math.abs(scroller.scrollLeft - lockedScrollPosRef.current.x) > 1) {
					scroller.scrollTo(lockedScrollPosRef.current.x, lockedScrollPosRef.current.y);
				}
			}
		};

		scroller.addEventListener('scroll', handleScroll, { passive: false, capture: true });
		return () => {
			scroller.removeEventListener('scroll', handleScroll, { capture: true });
		};
	}, [getTlEditor]);

	// Helper function to check if a store entry indicates a tool change
	const hasToolChanged = (entry: { changes?: { updated?: unknown } }): boolean => {
		if (!entry.changes?.updated) return false;
		
		for (const [from, to] of Object.values(entry.changes.updated as Record<string, [unknown, unknown]>)) {
			if (
				typeof from === 'object' && from !== null &&
				typeof to === 'object' && to !== null &&
				'typeName' in from && 'typeName' in to &&
				from.typeName === 'instance' && to.typeName === 'instance'
			) {
				return true;
			}
		}
		return false;
	};

	// Helper function to wrap a tool's pointer handlers with scroll locking
	const wrapToolWithScrollHandlers = (
		tool: ToolWithPointerHandlers
	): (() => void) => {
		// Save tool's previous handlers
		const prevDown = tool.onPointerDown;
		const prevUp = tool.onPointerUp;
		const prevMove = tool.onPointerMove;

		// Assign tool new handlers
		tool.onPointerDown = (e: TLPointerEventInfo) => {
			pointerDownRef.current = true;
			lockScroll();
			prevDown?.(e);
		};
		tool.onPointerUp = (e: TLPointerEventInfo) => {
			pointerDownRef.current = false;
			unlockScroll();
			prevUp?.(e);
		};
		tool.onPointerMove = (e: TLPointerEventInfo) => {
			prevMove?.(e);
		};

		// Return cleanup function to restore original handlers
		return () => {
			if (tool) {
				tool.onPointerDown = prevDown;
				tool.onPointerUp = prevUp;
				tool.onPointerMove = prevMove;
			}
		};
	};

	// Helper function to listen for tool changes and update handlers accordingly
	const listenForToolChangesAndUpdateHandlers = (
		resolveTlEditor: () => Editor | undefined,
	): (() => void) => {
		const editor = resolveTlEditor();
		if (!editor) return () => {}; // Return no-op cleanup if editor not available

		const handleToolChange = () => {
			const editor = resolveTlEditor();
			if (!editor) return;

			const newToolId = editor.getCurrentToolId();
			const previousToolId = currentTldrawToolIdRef.current;

			// If tool hasn't changed, do nothing
			if (newToolId === previousToolId) return;

			// Restore handlers on previous tool (if it exists and we've modified it)
			if (previousToolId && tldrawToolCleanupMap.current.has(previousToolId)) {
				const cleanup = tldrawToolCleanupMap.current.get(previousToolId);
				if (cleanup) {
					cleanup();
					tldrawToolCleanupMap.current.delete(previousToolId);
				}
			}

			// Set up handlers for new tool
			if (newToolId) {
				const tool = editor.getCurrentTool() as ToolWithPointerHandlers | null;
				if (tool) {
					if (!tldrawToolCleanupMap.current.has(newToolId)) {
						// Wrap tool with scroll handlers and track it
						const toolCleanupFn = wrapToolWithScrollHandlers(tool);
						tldrawToolCleanupMap.current.set(newToolId, toolCleanupFn);
						currentTldrawToolIdRef.current = newToolId;
					}
				}
			}
		};

		// Set up store listener to detect tool changes
		return editor.store.listen((entry) => {
			if (hasToolChanged(entry)) {
				handleToolChange();
			}
		}, {
			source: 'all',
			scope: 'all'
		});
	};

	// Helper function to poll until editor becomes available
	const listenForEditorToBecomeAvailable = (
		getTlEditor: () => Editor | undefined,
		onEditorReady: (editor: Editor) => void
	): (() => void) => {
		let pollInterval: number | null = null;
		let setupComplete = false;
		let retryCount = 0;

		pollInterval = window.setInterval(() => {
			if (setupComplete) return;

			const editor = getTlEditor();
			if (editor) {
				setupComplete = true;
				onEditorReady(editor);

				if (pollInterval) {
					window.clearInterval(pollInterval);
					pollInterval = null;
				}
			}

			retryCount++;
			if (retryCount >= MAX_POLL_RETRIES) {
				// Stop polling after max retries to avoid infinite polling
				if (pollInterval) {
					window.clearInterval(pollInterval);
					pollInterval = null;
				}
			}
		}, POLL_INTERVAL_MS);

		return () => {
			if (pollInterval) {
				window.clearInterval(pollInterval);
			}
		};
	};

	React.useEffect(() => {
		if (!getTlEditor) return;
		const resolveTlEditor = getTlEditor;

		let storeListenerCleanup: (() => void) | null = null;

		// Start polling for editor availability
		const stopPolling = listenForEditorToBecomeAvailable(resolveTlEditor, () => {
			// Editor is available, set up initial tool handlers
			const editor = resolveTlEditor();
			if (!editor) return;

			const initialToolId = editor.getCurrentToolId();
			if (initialToolId) {
				const tool = editor.getCurrentTool() as ToolWithPointerHandlers | null;
				if (tool) {
					// Verify the tool ID matches (safety check)
					const editorToolId = editor.getCurrentToolId();
					if (editorToolId === initialToolId && !tldrawToolCleanupMap.current.has(initialToolId)) {
						// Wrap tool with scroll handlers and track it
						const cleanup = wrapToolWithScrollHandlers(tool);
						tldrawToolCleanupMap.current.set(initialToolId, cleanup);
						currentTldrawToolIdRef.current = initialToolId;
					}
				}
			}
			// Start listening for tool changes
			storeListenerCleanup = listenForToolChangesAndUpdateHandlers(resolveTlEditor);
		});

		return () => {
			stopPolling();
			if (storeListenerCleanup) {
				storeListenerCleanup();
			}
			// Restore all modified tools
			tldrawToolCleanupMap.current.forEach((cleanup) => {
				cleanup();
			});
			tldrawToolCleanupMap.current.clear();
		};
	}, [getTlEditor]);

	return (
		<div
			ref={blockerRef}
			style={{
				position: 'absolute',
				inset: 0,
				zIndex: 1000,
				userSelect: 'none',
				WebkitUserSelect: 'none',
				MozUserSelect: 'none',
				msUserSelect: 'none',
			}}
			// Fallback that's useful only if hover is supported
			// Fires on pointer hover and also pointer up (Because the blocker reappears)
			onPointerEnter={(e) => {			closeKeyboard();
		}}
			// Fallback that's useful only if hover is supported
			// Fires on pointer leave and also pointer down (Because the blocker dissappears)
			// onPointerLeave={() => {
			// 	console.log('pointer leave!!!!');
			// 	unlockScroll();
			// }}

			// onWheel={(e) => {
			// 	const scroller = getScroller();
			// 	if (scroller) {
			// 		scroller.scrollTo({
			// 			top: scroller.scrollTop + e.deltaY,
			// 			left: scroller.scrollLeft + e.deltaX,
			// 		});
			// 	}
			// }}
		/>
	);
}


