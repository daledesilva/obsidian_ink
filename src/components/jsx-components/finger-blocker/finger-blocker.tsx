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

	// Setup native event listeners to aggressively prevent default behavior for pen/mouse
	React.useEffect(() => {
		const element = blockerRef.current;
		if (!element) return;

		const handlePointerDown = (e: PointerEvent) => {
			if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
				// Dynamically prevent touch gestures for Pen
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
			} else if (e.pointerType === 'touch' && recentPenInputRef.current) {
				// Logic to manually scroll if needed, but here we just want to handle the scroll logic 
				// that was previously in onPointerMove for touch
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

		// Add listeners with passive: false to ensure preventDefault works
		element.addEventListener('pointerdown', handlePointerDown, { passive: false, capture: true });
		element.addEventListener('pointermove', handlePointerMove, { passive: false, capture: true });
		element.addEventListener('pointerup', handlePointerUp, { passive: false, capture: true });
		element.addEventListener('pointercancel', handlePointerCancel, { passive: false, capture: true });

		return () => {
			element.removeEventListener('pointerdown', handlePointerDown, { capture: true });
			element.removeEventListener('pointermove', handlePointerMove, { capture: true });
			element.removeEventListener('pointerup', handlePointerUp, { capture: true });
			element.removeEventListener('pointercancel', handlePointerCancel, { capture: true });
		};
	}, []);

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


