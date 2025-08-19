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
			onPointerDown={(e) => {
				if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
					const canvas = getCanvas();
					if (canvas) {
						const forwarded = new PointerEvent('pointerdown', {
							pointerId: e.pointerId,
							pointerType: e.pointerType,
							clientX: e.clientX,
							clientY: e.clientY,
							bubbles: true,
						});
						canvas.dispatchEvent(forwarded);
						recentPenInputRef.current = true;
					}
				}
			}}
			onPointerMove={(e) => {
				if (e.pointerType !== 'touch') return;
				if (!recentPenInputRef.current) return;
				const scroller = getScroller();
				if (scroller) {
					scroller.scrollTo({
						top: scroller.scrollTop - e.movementY,
						left: scroller.scrollLeft - e.movementX,
					});
				}
			}}
			onPointerUp={(e) => {
				if (e.pointerType === 'touch') {
					recentPenInputRef.current = false;
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


