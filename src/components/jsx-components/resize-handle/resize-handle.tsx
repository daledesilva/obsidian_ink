import { useAtomValue } from 'jotai';
import './resize-handle.scss';
import classNames from "classnames";
import * as React from "react";
import { SelectIcon } from 'src/graphics/icons/select-icon';
import { VerticalResizeIcon } from 'src/graphics/icons/vertical-resize-icon';

//////////
//////////

interface ResizeHandleProps {
    resizeEmbed: (pxWidthDiff: number, pxHeightDiff: number) => void,
}

export const ResizeHandle: React.FC<ResizeHandleProps> = (props) => {
	const lastPointerXPosition = React.useRef<number>();
	const lastPointerYPosition = React.useRef<number>();

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

		delete lastPointerXPosition.current;
		delete lastPointerYPosition.current;
	}
	function handleMouseResizing(e: MouseEvent) {
		let horzDiff = e.movementX;
		horzDiff *= 2; // Multiply by 2 to compensate for image alignment to centre.
		let vertDiff = e.movementY;
		props.resizeEmbed(horzDiff, vertDiff);
	}
	function handleTouchResizing(e: TouchEvent) {
		// Prevent page scrolling while dragging
		e.preventDefault();

		// Since no scrolling occurs, obsidian gestures will kick in. This prevents them.
		e.stopPropagation();

		// Make sure there's exactly one finger
		const touchPointer = e.changedTouches.item(0);
		if(!touchPointer || e.changedTouches.length!==1) return;

		if(lastPointerXPosition.current && lastPointerYPosition.current) {
			let horzDiff = touchPointer.pageX - lastPointerXPosition.current;
			horzDiff *= 2; // Multiply by 2 to compensate for image alignment to centre.
			const vertDiff = touchPointer.pageY - lastPointerYPosition.current;
			props.resizeEmbed(horzDiff, vertDiff);
		}

		lastPointerXPosition.current = touchPointer.pageX;
		lastPointerYPosition.current = touchPointer.pageY;
	}

};
