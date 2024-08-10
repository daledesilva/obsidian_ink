import "./drawing-menu.scss";
import * as React from "react";
import { UndoIcon } from "src/graphics/icons/undo-icon";
import { RedoIcon } from "src/graphics/icons/redo-icon";
import { SelectIcon } from "src/graphics/icons/select-icon";
import { EraseIcon } from "src/graphics/icons/erase-icon";
import { DrawIcon } from "src/graphics/icons/draw-icon";

//////////
//////////

interface DrawingMenuProps {
    canUndo: boolean,
    canRedo: boolean,
    curTool: tool,
    onUndoClick: React.MouseEventHandler<HTMLButtonElement>,
    onRedoClick: React.MouseEventHandler<HTMLButtonElement>,
    onSelectClick: React.MouseEventHandler<HTMLButtonElement>,
    onDrawClick: React.MouseEventHandler<HTMLButtonElement>,
    onEraseClick: React.MouseEventHandler<HTMLButtonElement>,
}

export const DrawingMenu = React.forwardRef<HTMLDivElement, DrawingMenuProps>((props, ref) => {

    return <>
        <div
            ref = {ref}
            className = 'ink_menu-bar'
        >
            <div
                className='ink_quick-menu'
            >
                <button
                    onPointerDown={props.onUndoClick}
                    disabled={!props.canUndo}
                >
                    <UndoIcon/>
                </button>
                <button
                    onPointerDown={props.onRedoClick}
                    disabled={!props.canRedo}
                >
                    <RedoIcon/>
                </button>
            </div>
            <div
                className='ink_tool-menu'
            >
                <button
                    onPointerDown={props.onSelectClick}
                    disabled={props.curTool === tool.select}
                >
                    <SelectIcon/>
                </button>
                <button
                    onPointerDown={props.onDrawClick}
                    disabled={props.curTool === tool.draw}
                >
                    <DrawIcon/>
                </button>
                <button
                    onPointerDown={props.onEraseClick}
                    disabled={props.curTool === tool.eraser}
                >
                    <EraseIcon/>
                </button>
            </div>
            <div
                className='ink_other-menu'
            >
                
            </div>
        </div>
    </>;

});

export default DrawingMenu;