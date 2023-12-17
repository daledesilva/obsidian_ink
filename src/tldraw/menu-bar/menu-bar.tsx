import * as React from "react";
import { App, Editor, MarkdownView, Plugin } from "obsidian";
import { tool } from "../write/tldraw-handwritten-editor";
import HandwritePlugin from "../../main";

//////////
//////////

import "./menu-bar.scss";

//////////

export const MENUBAR_HEIGHT_PX = 200;

interface MenuBarProps {
    canUndo: boolean,
    canRedo: boolean,
    curTool: tool,
    onUndoClick: React.MouseEventHandler<HTMLButtonElement>,
    onRedoClick: React.MouseEventHandler<HTMLButtonElement>,
    onSelectClick: React.MouseEventHandler<HTMLButtonElement>,
    onDrawClick: React.MouseEventHandler<HTMLButtonElement>,
    onEraseClick: React.MouseEventHandler<HTMLButtonElement>,
    onOpenClick: React.MouseEventHandler<HTMLButtonElement> | false | undefined,
}

export const MenuBar = React.forwardRef<HTMLDivElement, MenuBarProps>((props, ref) => {

    return <>
        <div
            ref = {ref}
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
                    Draw
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
                {props.onOpenClick && (
                    <button onClick={props.onOpenClick}>Open</button>
                )}
            </div>
        </div>
    </>;

});






export default MenuBar;