import * as React from 'react';
import type { MenuOption } from '../overflow-menu/overflow-menu';
import {
	showMenuOptionsAtPosition,
} from '../overflow-menu/show-menu-options';

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_THRESHOLD_PX = 10;

export const EmbedPreviewContextMenu: React.FC<{
	menuOptions: MenuOption[];
	children: React.ReactNode;
}> = (props) => {
	const wrapperRef = React.useRef<HTMLDivElement>(null);
	const longPressTimerRef = React.useRef<number | null>(null);
	const longPressStartRef = React.useRef<{ x: number; y: number } | null>(null);
	const longPressHandledRef = React.useRef(false);

	React.useEffect(() => {
		return () => {
			if (longPressTimerRef.current) {
				window.clearTimeout(longPressTimerRef.current);
			}
		};
	}, []);

	function clearLongPressTimer() {
		if (longPressTimerRef.current) {
			window.clearTimeout(longPressTimerRef.current);
			longPressTimerRef.current = null;
		}
		longPressStartRef.current = null;
	}

	function showMenuAtClientPoint(clientX: number, clientY: number) {
		showMenuOptionsAtPosition(props.menuOptions, { x: clientX, y: clientY });
	}

	function handleContextMenu(e: React.MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		showMenuAtClientPoint(e.clientX, e.clientY);
	}

	function handlePointerDown(e: React.PointerEvent) {
		if (e.pointerType !== 'touch') return;

		longPressHandledRef.current = false;
		longPressStartRef.current = { x: e.clientX, y: e.clientY };
		clearLongPressTimer();

		longPressTimerRef.current = window.setTimeout(() => {
			longPressTimerRef.current = null;
			longPressHandledRef.current = true;
			longPressStartRef.current = null;
			showMenuAtClientPoint(e.clientX, e.clientY);
		}, LONG_PRESS_MS);
	}

	function handlePointerMove(e: React.PointerEvent) {
		if (!longPressStartRef.current || !longPressTimerRef.current) return;

		const dx = e.clientX - longPressStartRef.current.x;
		const dy = e.clientY - longPressStartRef.current.y;
		if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_THRESHOLD_PX) {
			clearLongPressTimer();
		}
	}

	function handlePointerUp(e: React.PointerEvent) {
		clearLongPressTimer();

		if (longPressHandledRef.current) {
			e.preventDefault();
			e.stopPropagation();
			longPressHandledRef.current = false;
		}
	}

	function handleClickCapture(e: React.MouseEvent) {
		if (longPressHandledRef.current) {
			e.preventDefault();
			e.stopPropagation();
			longPressHandledRef.current = false;
		}
	}

	return (
		<div
			ref={wrapperRef}
			className="ddc_ink_embed-preview-context-menu"
			style={{ position: 'absolute', width: '100%', height: '100%' }}
			onContextMenu={handleContextMenu}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
			onClickCapture={handleClickCapture}
		>
			{props.children}
		</div>
	);
};

export default EmbedPreviewContextMenu;
