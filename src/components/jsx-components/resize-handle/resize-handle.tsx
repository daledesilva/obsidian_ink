import './resize-handle.scss';
import classNames from 'classnames';
import * as React from 'react';
import { ResizeDiagonalIcon } from 'src/graphics/icons/resize-diagonal-icon';
import { DominantHand } from 'src/types/plugin-settings_0_5_0';
import { useDominantHand } from 'src/stores/dominant-hand-store';

//////////
//////////

interface ResizeHandleProps {
	resizeEmbed: (pxWidthDiff: number, pxHeightDiff: number) => void;
	onResizeStart?: () => void;
	onResizeEnd?: () => void;
}

function getHorzResizeDiff(movementX: number, dominantHand: DominantHand): number {
	const sign = dominantHand === 'left' ? -1 : 1;
	return movementX * 2 * sign;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = (props) => {
	const dominantHand = useDominantHand();
	const lastPointerXPosition = React.useRef<number>();
	const lastPointerYPosition = React.useRef<number>();

	return <button
		className={classNames([
			'ddc_ink_resize-handle',
			dominantHand === 'left' && 'ddc_ink_resize-handle--left',
		])}
		onPointerDown={startResizing}
	>
		<ResizeDiagonalIcon/>
	</button>

	// Helpers
	//////////
	function startResizing(e: React.MouseEvent<HTMLElement>) {
		props.onResizeStart?.();
		activeDocument.addEventListener('mousemove', handleMouseResizing);
		activeDocument.addEventListener('mouseup', stopResizing);

		activeDocument.addEventListener('touchmove', handleTouchResizing, { passive: false });
		activeDocument.addEventListener('touchend', stopResizing);
	}
	function stopResizing(e: Event) {
		activeDocument.removeEventListener('mousemove', handleMouseResizing);
		activeDocument.removeEventListener('mouseup', stopResizing);

		activeDocument.removeEventListener('touchmove', handleTouchResizing);
		activeDocument.removeEventListener('touchend', stopResizing);

		delete lastPointerXPosition.current;
		delete lastPointerYPosition.current;

		props.onResizeEnd?.();
	}
	function handleMouseResizing(e: MouseEvent) {
		const horzDiff = getHorzResizeDiff(e.movementX, dominantHand);
		const vertDiff = e.movementY;
		props.resizeEmbed(horzDiff, vertDiff);
	}
	function handleTouchResizing(e: TouchEvent) {
		e.preventDefault();
		e.stopPropagation();

		const touchPointer = e.changedTouches.item(0);
		if (!touchPointer || e.changedTouches.length !== 1) return;

		if (lastPointerXPosition.current != null && lastPointerYPosition.current != null) {
			const horzDiff = getHorzResizeDiff(
				touchPointer.pageX - lastPointerXPosition.current,
				dominantHand,
			);
			const vertDiff = touchPointer.pageY - lastPointerYPosition.current;
			props.resizeEmbed(horzDiff, vertDiff);
		}

		lastPointerXPosition.current = touchPointer.pageX;
		lastPointerYPosition.current = touchPointer.pageY;
	}

};
