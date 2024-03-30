import "./writing-menu.scss";
import * as React from "react";
import { tool } from "../writing/tldraw-writing-editor";

//////////
//////////

interface MenuBarProps {
    canUndo: boolean,
    canRedo: boolean,
    curTool: tool,
    onUndoClick: React.MouseEventHandler<HTMLButtonElement>,
    onRedoClick: React.MouseEventHandler<HTMLButtonElement>,
    onSelectClick: React.MouseEventHandler<HTMLButtonElement>,
    onDrawClick: React.MouseEventHandler<HTMLButtonElement>,
    onEraseClick: React.MouseEventHandler<HTMLButtonElement>,
}

export const WritingMenu = (props: MenuBarProps) => {

    return <>
        <div
            className = 'ink_write_menu-bar'
        >
            <div
                className='ink_quick-menu'
            >
                <button
                    onClick={props.onUndoClick}
                    disabled={!props.canUndo}
                >
                    Undo
                </button>
                <button
                    onClick={props.onRedoClick}
                    disabled={!props.canRedo}
                >
                    Redo
                </button>
            </div>
            <div
                className='ink_tool-menu'
            >
                <button
                    onClick={props.onSelectClick}
                    disabled={props.curTool === tool.select}
                >
                    Select
                </button>
                <button
                    onClick={props.onDrawClick}
                    disabled={props.curTool === tool.draw}
                >
                    Write
                </button>
                <button
                    onClick={props.onEraseClick}
                    disabled={props.curTool === tool.eraser}
                >
                    Erase
                </button>
            </div>
            <div
                className='ink_other-menu'
            >
            
            </div>
        </div>
    </>;

};

export default WritingMenu;