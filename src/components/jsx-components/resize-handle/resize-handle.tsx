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
	// const mousePosition = useRef<number>();

	return <button
		className = {classNames([
			'ddc_ink_resize-handle',
			'ddc_ink_vertical',
		])}
		onMouseDown={startResizing}
	>
		<VerticalResizeIcon/>
	</button>

	// Helpers
	//////////
	function startResizing(e: React.MouseEvent<HTMLElement>) {
		addEventListener("mousemove", monitorResizing);
		addEventListener("mouseup", stopResizing);
	}
	function stopResizing(e: MouseEvent) {
		removeEventListener("mousemove", monitorResizing);
		removeEventListener("mouseup", stopResizing);
	}
	function monitorResizing(e: MouseEvent) {
		props.resizeEmbed(e.movementY);
	}

};
