import * as React from 'react';
import type { Editor, TLPointerEventInfo } from '@tldraw/tldraw';

type FingerBlockerProps = {
	getTlEditor: () => Editor | undefined;
	wrapperRef?: React.RefObject<HTMLDivElement>;
};

export function FingerBlocker({ getTlEditor, wrapperRef }: FingerBlockerProps) {
	const blockerRef = React.useRef<HTMLDivElement>(null);
	const pointerDownRef = React.useRef<boolean>(false);
	const recentPenInputRef = React.useRef<boolean>(false);

	// Refs for scroll pinning strategy
	const isPenDownRef = React.useRef<boolean>(false);
	const lockedScrollPosRef = React.useRef<{ x: number; y: number } | null>(null);
	const activeScrollerRef = React.useRef<HTMLElement | null>(null);

	// Setup native event listeners to aggressively prevent default behavior for pen/mouse
	React.useEffect(() => {
		const element = blockerRef.current;
		if (!element) return;

		const getScroller = (): HTMLElement | null => {
			const wrapper = wrapperRef?.current || blockerRef.current?.parentElement;
			return wrapper?.closest('.cm-scroller') as HTMLElement | null;
		};

		const handlePointerDown = (e: PointerEvent) => {
			if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
				// 1. Lock Scroll: Find scroller and set overflow hidden
				const scroller = getScroller();
				if (scroller) {
					activeScrollerRef.current = scroller;
					lockedScrollPosRef.current = { x: scroller.scrollLeft, y: scroller.scrollTop };
					scroller.style.overflow = 'hidden';
					isPenDownRef.current = true;
				}

				// Dynamically prevent touch gestures for Pen (keep this as backup)
				element.style.touchAction = 'none';

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

				const canvas = getCanvas();
				if (canvas) {
					const forwarded = new PointerEvent('pointerdown', {
						pointerId: e.pointerId,
						pointerType: e.pointerType,
						clientX: e.clientX,
						clientY: e.clientY,
						bubbles: true,
						cancelable: true,
						view: window,
						detail: e.detail,
						screenX: e.screenX,
						screenY: e.screenY,
						ctrlKey: e.ctrlKey,
						shiftKey: e.shiftKey,
						altKey: e.altKey,
						metaKey: e.metaKey,
						button: e.button,
						buttons: e.buttons,
					});
					canvas.dispatchEvent(forwarded);
					recentPenInputRef.current = true;
				}
			} else if (e.pointerType === 'touch') {
				// Explicitly allow touch actions for Finger
				element.style.touchAction = 'pan-x pan-y';
			}
		};

		const handlePointerMove = (e: PointerEvent) => {
			if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();

				// Re-assert scroll lock if needed
				if (isPenDownRef.current && activeScrollerRef.current && lockedScrollPosRef.current) {
					const scroller = activeScrollerRef.current;
					if (Math.abs(scroller.scrollTop - lockedScrollPosRef.current.y) > 1 || 
						Math.abs(scroller.scrollLeft - lockedScrollPosRef.current.x) > 1) {
						scroller.scrollTo(lockedScrollPosRef.current.x, lockedScrollPosRef.current.y);
					}
				}
			} else if (e.pointerType === 'touch' && recentPenInputRef.current) {
				// Logic to manually scroll if needed
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
			// Reset touch-action
			element.style.touchAction = '';
			
			// Unlock Scroll
			if (isPenDownRef.current) {
				isPenDownRef.current = false;
				if (activeScrollerRef.current) {
					activeScrollerRef.current.style.overflow = ''; // Restore default
					activeScrollerRef.current = null;
				}
				lockedScrollPosRef.current = null;
			}
			
			if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
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
				recentPenInputRef.current = false;
			}
		};

		const handlePointerCancel = (e: PointerEvent) => {
			element.style.touchAction = '';

			// Unlock Scroll
			if (isPenDownRef.current) {
				isPenDownRef.current = false;
				if (activeScrollerRef.current) {
					activeScrollerRef.current.style.overflow = '';
					activeScrollerRef.current = null;
				}
				lockedScrollPosRef.current = null;
			}

			if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
				const target = e.target as HTMLElement;
				if (target.hasPointerCapture(e.pointerId)) {
					try {
						target.releasePointerCapture(e.pointerId);
					} catch (err) {
						// Ignore
					}
				}
			}
		}

		const handleWheel = (e: WheelEvent) => {
			if (isPenDownRef.current) {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
			}
		};

		const handleTouchMove = (e: TouchEvent) => {
			if (isPenDownRef.current) {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
			}
		};

		// Add listeners with passive: false to ensure preventDefault works
		element.addEventListener('pointerdown', handlePointerDown, { passive: false, capture: true });
		element.addEventListener('pointermove', handlePointerMove, { passive: false, capture: true });
		element.addEventListener('pointerup', handlePointerUp, { passive: false, capture: true });
		element.addEventListener('pointercancel', handlePointerCancel, { passive: false, capture: true });
		element.addEventListener('wheel', handleWheel, { passive: false, capture: true });
		element.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });

		return () => {
			element.removeEventListener('pointerdown', handlePointerDown, { capture: true });
			element.removeEventListener('pointermove', handlePointerMove, { capture: true });
			element.removeEventListener('pointerup', handlePointerUp, { capture: true });
			element.removeEventListener('pointercancel', handlePointerCancel, { capture: true });
			element.removeEventListener('wheel', handleWheel, { capture: true });
			element.removeEventListener('touchmove', handleTouchMove, { capture: true });
		};
	}, []);

	// Add scroll restoration listener to the scroller itself
	React.useEffect(() => {
		const getScroller = (): HTMLElement | null => {
			const wrapper = wrapperRef?.current || blockerRef.current?.parentElement;
			return wrapper?.closest('.cm-scroller') as HTMLElement | null;
		};

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
	}, [getTlEditor]); // Re-run if editor changes (likely component mounted/unmounted)

	React.useEffect(() => {
		const editor = getTlEditor();
		if (!editor) return;
		const tool = editor.getCurrentTool();
		if (!tool) return;

		const prevDown = tool.onPointerDown;
		const prevUp = tool.onPointerUp;
		const prevMove = tool.onPointerMove;

		tool.onPointerDown = (e: TLPointerEventInfo) => {
			pointerDownRef.current = true;
			prevDown?.(e);
		};
		tool.onPointerUp = (e: TLPointerEventInfo) => {
			pointerDownRef.current = false;
			prevUp?.(e);
		};
		tool.onPointerMove = (e: TLPointerEventInfo) => {
			prevMove?.(e);
		};

		return () => {
			tool.onPointerDown = prevDown;
			tool.onPointerUp = prevUp;
			tool.onPointerMove = prevMove;
		};
	}, [getTlEditor]);

	const getWrapper = (): HTMLDivElement | null => {
		return (
			wrapperRef?.current ||
			(blockerRef.current?.parentElement as HTMLDivElement | null) ||
			null
		);
	};

	const getCanvas = (): HTMLElement | null => {
		const wrapper = getWrapper();
		return wrapper ? (wrapper.querySelector('.tl-canvas') as HTMLElement | null) : null;
	};

	const getScroller = (): HTMLElement | null => {
		const wrapper = getWrapper();
		return wrapper ? (wrapper.closest('.cm-scroller') as HTMLElement | null) : null;
	};

	const lockScroll = () => {
		const scroller = getScroller();
		if (scroller) {
			scroller.style.overflow = 'hidden';
			scroller.style.scrollbarColor = 'transparent transparent';
		}
	};

	const unlockScroll = () => {
		const scroller = getScroller();
		if (scroller) {
			scroller.style.overflow = 'auto';
			setTimeout(() => {
				scroller.style.scrollbarColor = 'auto';
			}, 200);
		}
	};

	const closeKeyboard = () => {
		const active = document.activeElement as HTMLElement | null;
		if (active && !active.classList.contains('tl-canvas')) {
			active.blur();
		}
	};

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
			onPointerEnter={(e) => {
				if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
					lockScroll();
					closeKeyboard();
				} else {
					unlockScroll();
					closeKeyboard();
				}
			}}
			onPointerLeave={() => {
				if (!pointerDownRef.current) {
					recentPenInputRef.current = false;
					unlockScroll();
				}
			}}
			onWheel={(e) => {
				const scroller = getScroller();
				if (scroller) {
					scroller.scrollTo({
						top: scroller.scrollTop + e.deltaY,
						left: scroller.scrollLeft + e.deltaX,
					});
				}
			}}
		/>
	);
}


