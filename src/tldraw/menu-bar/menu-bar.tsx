import * as React from "react";


//////////
//////////

import "./menu-bar.scss";
import { Editor } from "obsidian";

//////////

export function MenuBar (props: {
    onUndoClick: React.MouseEventHandler<HTMLButtonElement>,
    onRedoClick: React.MouseEventHandler<HTMLButtonElement>,
    onSelectClick: React.MouseEventHandler<HTMLButtonElement>,
    onDrawClick: React.MouseEventHandler<HTMLButtonElement>,
    onEraseClick: React.MouseEventHandler<HTMLButtonElement>,
    onOpenClick: React.MouseEventHandler<HTMLButtonElement>,
}) {
	
	return <>
		<div
            className = 'ink_write_menu-bar'
		>
			<div
                className = 'ink_quick-menu'
            >
                <button onClick={props.onUndoClick}>Undo</button>
                <button onClick={props.onRedoClick}>Redo</button>
            </div>
			<div
                className = 'ink_tool-menu'
            >
                <button onClick={props.onSelectClick}>Select</button>
                <button onClick={props.onDrawClick}>Draw</button>
                <button onClick={props.onEraseClick}>Erase</button>
            </div>
			<div
                className = 'ink_other-menu'
            >
                <button onClick={props.onOpenClick}>Open</button>
            </div>
		</div>
	</>;
	
};



export default MenuBar;