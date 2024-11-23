import { useAtomValue } from 'jotai';
import './resize-handle.scss';
import classNames from "classnames";
import * as React from "react";
import { SelectIcon } from 'src/graphics/icons/select-icon';
import { VerticalResizeIcon } from 'src/graphics/icons/vertical-resize-icon';

//////////
//////////

interface ResizeHandleProps {
    resizeEmbed: (pxHeightDiff: number) => void,
}

export const ResizeHandle: React.FC<ResizeHandleProps> = (props) => {
	const lastPointerPosition = React.useRef<number>();

	return <button
		className = {classNames([
			'ddc_ink_resize-handle',
			'ddc_ink_vertical',
		])}
		// onMouseDown={startResizing}
		onPointerDown={startResizing}
	>
		<VerticalResizeIcon/>
	</button>

	// Helpers
	//////////
	function startResizing(e: React.MouseEvent<HTMLElement>) {
		document.addEventListener("mousemove", handleMouseResizing);
		document.addEventListener("mouseup", stopResizing);

		// document.addEventListener("touchstart", handleTouchResizing, { passive: false });
		document.addEventListener("touchmove", handleTouchResizing, { passive: false });
		document.addEventListener("touchend", stopResizing);
	}
	function stopResizing(e: Event) {
		document.removeEventListener("mousemove", handleMouseResizing);
		document.removeEventListener("mouseup", stopResizing);

		// document.removeEventListener("touchstart", handleMouseResizing);
		document.removeEventListener("touchmove", handleTouchResizing);
		document.removeEventListener("touchend", stopResizing);

		delete lastPointerPosition.current;
	}
	function handleMouseResizing(e: MouseEvent) {
		props.resizeEmbed(e.movementY);
	}
	function handleTouchResizing(e: TouchEvent) {
		// Prevent page scrolling while dragging
		e.preventDefault();

		// Since no scrolling occurs, obsidian gestures will kick in. This prevents them.
		e.stopPropagation();

		// Make sure there's exactly one finger
		const touchPointer = e.changedTouches.item(0);
		if(!touchPointer || e.changedTouches.length!==1) return;

		if(lastPointerPosition.current) {
			const vertDiff = touchPointer.pageY - lastPointerPosition.current;
			props.resizeEmbed(vertDiff);
		}

		lastPointerPosition.current = touchPointer.pageY;
	}

};
