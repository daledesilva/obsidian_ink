import * as React from 'react';

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

function forwardPointerEvent(target: EventTarget, type: string, source: PointerEvent): void {
	target.dispatchEvent(
		new PointerEvent(type, {
			pointerId: source.pointerId,
			pointerType: source.pointerType,
			clientX: source.clientX,
			clientY: source.clientY,
			bubbles: true,
			cancelable: true,
			view: window,
			detail: source.detail,
			screenX: source.screenX,
			screenY: source.screenY,
			ctrlKey: source.ctrlKey,
			shiftKey: source.shiftKey,
			altKey: source.altKey,
			metaKey: source.metaKey,
			button: source.button,
			buttons: source.buttons,
			pressure: source.pressure,
			width: source.width,
			height: source.height,
		}),
	);
}

export type FingerBlockerProps = {
	wrapperRef?: React.RefObject<HTMLDivElement>;
	/** Embedded writing: two-finger scroll goes to the note, not the canvas. */
	writingMode?: boolean;
	isEmbedded?: boolean;
	/** When false, pen is still absorbed (no Obsidian swipe) but not forwarded (Boox-only input). */
	forwardPenToCanvas?: boolean;
	/** Drawing embed: two-finger pinch/pan on the ink canvas (container-relative anchor). */
	onDrawingEmbedTwoFingerGesture?: (params: {
		deltaX: number;
		deltaY: number;
		anchorX: number;
		anchorY: number;
		distanceRatio: number;
	}) => void;
};

/**
 * Overlay on ink-svg-canvas embeds: pen locks note scroll and forwards to `.ink-svg-canvas`;
 * finger scrolls the note. Legacy tldraw editors use their own format-local FingerBlocker copy.
 */
export function FingerBlocker({
	wrapperRef,
	writingMode = false,
	isEmbedded = false,
	forwardPenToCanvas = true,
	onDrawingEmbedTwoFingerGesture,
}: FingerBlockerProps) {
	const blockerRef = React.useRef<HTMLDivElement>(null);
	const isPenDownRef = React.useRef(false);
	const recentPenInputRef = React.useRef(false);
	const lockedScrollPosRef = React.useRef<{ x: number; y: number } | null>(null);
	const activeScrollerRef = React.useRef<HTMLElement | null>(null);
	const twoFingerGestureActiveRef = React.useRef(false);
	const prevTwoFingerMidpointRef = React.useRef({ x: 0, y: 0 });
	const prevTwoFingerDistanceRef = React.useRef(0);
	const onGestureRef = React.useRef(onDrawingEmbedTwoFingerGesture);
	React.useEffect(() => {
		onGestureRef.current = onDrawingEmbedTwoFingerGesture;
	}, [onDrawingEmbedTwoFingerGesture]);

	const getWrapper = (): HTMLDivElement | null =>
		wrapperRef?.current ?? (blockerRef.current?.parentElement as HTMLDivElement | null);

	const getInkSvg = (): SVGSVGElement | null => {
		const wrapper = getWrapper();
		return wrapper?.querySelector('.ink-svg-canvas') ?? null;
	};

	const getScroller = (): HTMLElement | null => {
		const wrapper = getWrapper();
		return wrapper?.closest('.cm-scroller') as HTMLElement | null;
	};

	const lockScroll = () => {
		const scroller = getScroller();
		if (scroller) {
			activeScrollerRef.current = scroller;
			lockedScrollPosRef.current = { x: scroller.scrollLeft, y: scroller.scrollTop };
			scroller.classList.add(INK_CM_SCROLLER_SCROLL_PINNED_CLASS);
		}
	};

	const unlockScroll = () => {
		if (isPenDownRef.current) {
			isPenDownRef.current = false;
			if (activeScrollerRef.current) {
				activeScrollerRef.current.style.overflow = 'auto';
				window.setTimeout(() => {
					if (activeScrollerRef.current) {
						activeScrollerRef.current.style.scrollbarColor = 'auto';
					}
				}, 200);
				activeScrollerRef.current = null;
			}
			lockedScrollPosRef.current = null;
		} else {
			const scroller = getScroller();
			if (scroller) {
				scroller.style.overflow = 'auto';
				window.setTimeout(() => {
					scroller.style.scrollbarColor = 'auto';
				}, 200);
			}
		}
	};

	const reassertScrollPin = () => {
		if (!isPenDownRef.current || !activeScrollerRef.current || !lockedScrollPosRef.current) return;
		const scroller = activeScrollerRef.current;
		const lockedScrollPos = lockedScrollPosRef.current;
		if (
			Math.abs(scroller.scrollTop - lockedScrollPos.y) > 1 ||
			Math.abs(scroller.scrollLeft - lockedScrollPos.x) > 1
		) {
			scroller.scrollTo(lockedScrollPos.x, lockedScrollPos.y);
		}
	};

	const enableDrawingTwoFinger = !writingMode && isEmbedded && !!onDrawingEmbedTwoFingerGesture;

	const closeKeyboard = () => {
		const active = document.activeElement as HTMLElement | null;
		if (active && !active.classList.contains('ink-svg-canvas')) {
			active.blur();
		}
	};

	React.useEffect(() => {
		const element = blockerRef.current;
		if (!element) return;

		const handlePointerDown = (e: PointerEvent) => {
			if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
				if (e.pointerType === 'mouse' && (e.button === 3 || e.button === 4)) return;

				if (isDrawingPointer(e)) {
					lockScroll();
					isPenDownRef.current = true;
				}

				setFingerBlockerTouchMode(element, 'none');
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();

				try {
					(e.target as HTMLElement).setPointerCapture(e.pointerId);
				} catch {
					// ignore
				}

				if (forwardPenToCanvas && isDrawingPointer(e)) {
					const svg = getInkSvg();
					if (svg) {
						forwardPointerEvent(svg, 'pointerdown', e);
						recentPenInputRef.current = true;
					}
				}
			} else if (e.pointerType === 'touch' && !twoFingerGestureActiveRef.current) {
				setFingerBlockerTouchMode(element, 'pan-xy');
			}
		};

		const handlePointerMove = (e: PointerEvent) => {
			if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				reassertScrollPin();

				if (forwardPenToCanvas && isDrawingPointer(e)) {
					const svg = getInkSvg();
					if (svg) forwardPointerEvent(svg, 'pointermove', e);
				}
			} else if (e.pointerType === 'touch' && recentPenInputRef.current) {
				const scroller = getScroller();
				if (scroller) {
					scroller.scrollTo({
						top: scroller.scrollTop - e.movementY,
						left: scroller.scrollLeft - e.movementX,
					});
				}
			}
		};

		const handlePointerUp = (e: PointerEvent) => {
			if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
				setFingerBlockerTouchMode(element, 'default');
				unlockScroll();
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();

				const target = e.target as HTMLElement;
				if (target.hasPointerCapture(e.pointerId)) {
					try {
						target.releasePointerCapture(e.pointerId);
					} catch {
						// ignore
					}
				}

				if (forwardPenToCanvas && isDrawingPointer(e)) {
					const svg = getInkSvg();
					if (svg) forwardPointerEvent(svg, 'pointerup', e);
				}
			} else if (e.pointerType === 'touch') {
				recentPenInputRef.current = false;
			}
		};

		const handlePointerCancel = (e: PointerEvent) => {
			setFingerBlockerTouchMode(element, 'default');
			if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
				unlockScroll();
				if (forwardPenToCanvas && isDrawingPointer(e)) {
					const svg = getInkSvg();
					if (svg) forwardPointerEvent(svg, 'pointercancel', e);
				}
			} else if (e.pointerType === 'touch') {
				recentPenInputRef.current = false;
			}
		};

		const handleWheel = (e: WheelEvent) => {
			if (!isPenDownRef.current) return;
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
		};

		const handleTouchStart = (e: TouchEvent) => {
			if (!enableDrawingTwoFinger || e.touches.length !== 2) return;
			e.preventDefault();
			e.stopPropagation();
			setFingerBlockerTouchMode(element, 'none');
			twoFingerGestureActiveRef.current = true;
			const t0 = e.touches[0];
			const t1 = e.touches[1];
			prevTwoFingerMidpointRef.current = {
				x: (t0.clientX + t1.clientX) / 2,
				y: (t0.clientY + t1.clientY) / 2,
			};
			prevTwoFingerDistanceRef.current = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
		};

		const handleTouchMove = (e: TouchEvent) => {
			if (isPenDownRef.current || twoFingerGestureActiveRef.current) {
				e.preventDefault();
				if (isPenDownRef.current || twoFingerGestureActiveRef.current) {
					e.stopPropagation();
					e.stopImmediatePropagation();
				}
			}

			if (!twoFingerGestureActiveRef.current || e.touches.length < 2) return;

			const wrapper = getWrapper();
			if (!wrapper) return;

			const t0 = e.touches[0];
			const t1 = e.touches[1];
			const newMid = {
				x: (t0.clientX + t1.clientX) / 2,
				y: (t0.clientY + t1.clientY) / 2,
			};
			const newDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
			const dx = newMid.x - prevTwoFingerMidpointRef.current.x;
			const dy = newMid.y - prevTwoFingerMidpointRef.current.y;
			const ratio = prevTwoFingerDistanceRef.current > 0 ? newDist / prevTwoFingerDistanceRef.current : 1;
			const containerRect = wrapper.getBoundingClientRect();

			onGestureRef.current?.({
				deltaX: dx,
				deltaY: dy,
				anchorX: newMid.x - containerRect.left,
				anchorY: newMid.y - containerRect.top,
				distanceRatio: ratio,
			});

			prevTwoFingerMidpointRef.current = newMid;
			prevTwoFingerDistanceRef.current = newDist;
		};

		const handleTouchEnd = (e: TouchEvent) => {
			recentPenInputRef.current = false;
			if (twoFingerGestureActiveRef.current && e.touches.length < 2) {
				twoFingerGestureActiveRef.current = false;
				setFingerBlockerTouchMode(element, 'default');
			}
		};

		const handleLostPointerCapture = () => {
			if (isPenDownRef.current) unlockScroll();
		};

		const captureOpts: AddEventListenerOptions = { capture: true, passive: false };

		element.addEventListener('pointerdown', handlePointerDown, captureOpts);
		element.addEventListener('pointermove', handlePointerMove, captureOpts);
		element.addEventListener('pointerup', handlePointerUp, captureOpts);
		element.addEventListener('pointercancel', handlePointerCancel, captureOpts);
		element.addEventListener('lostpointercapture', handleLostPointerCapture);
		element.addEventListener('wheel', handleWheel, captureOpts);
		element.addEventListener('touchstart', handleTouchStart, captureOpts);
		element.addEventListener('touchmove', handleTouchMove, captureOpts);
		element.addEventListener('touchend', handleTouchEnd, captureOpts);
		element.addEventListener('touchcancel', handleTouchEnd, captureOpts);

		const scroller = getScroller();
		const handleScroll = () => reassertScrollPin();
		if (scroller) {
			scroller.addEventListener('scroll', handleScroll, captureOpts);
		}

		return () => {
			isPenDownRef.current = false;
			unlockScroll();
			element.removeEventListener('pointerdown', handlePointerDown, captureOpts);
			element.removeEventListener('pointermove', handlePointerMove, captureOpts);
			element.removeEventListener('pointerup', handlePointerUp, captureOpts);
			element.removeEventListener('pointercancel', handlePointerCancel, captureOpts);
			element.removeEventListener('lostpointercapture', handleLostPointerCapture);
			element.removeEventListener('wheel', handleWheel, captureOpts);
			element.removeEventListener('touchstart', handleTouchStart, captureOpts);
			element.removeEventListener('touchmove', handleTouchMove, captureOpts);
			element.removeEventListener('touchend', handleTouchEnd, captureOpts);
			element.removeEventListener('touchcancel', handleTouchEnd, captureOpts);
			if (scroller) {
				scroller.removeEventListener('scroll', handleScroll, captureOpts);
			}
		};
	}, [forwardPenToCanvas, enableDrawingTwoFinger, writingMode, isEmbedded]);

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
			onPointerEnter={() => closeKeyboard()}
		/>
	);
}
