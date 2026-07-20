import "./drawing-menu.scss";
import * as React from "react";
import { SelectIcon } from "src/graphics/icons/select-icon";
import { EraseIcon } from "src/graphics/icons/erase-icon";
import { Editor } from "@tldraw/tldraw";
import { DrawIcon } from "src/graphics/icons/draw-icon";
import classNames from "classnames";
import { TooltipButton } from "src/components/jsx-components/tooltip-button/tooltip-button";

//////////
//////////

export enum tool {
	select = 'select',
	draw = 'draw',
	eraser = 'eraser',
}
interface DrawingMenuProps {
	getTlEditor: () => Editor | undefined,
	onStoreChange: (elEditor: Editor) => void,
	onActivateTool?: (tool: 'draw' | 'eraser' | 'select') => void,
	/** When provided, local undo/redo sync with the unified stack. */
	embedId?: string,
	workspaceLeafId?: string,
	plugin?: import("src/main").default,
}

export const DrawingMenu = React.forwardRef<HTMLDivElement, DrawingMenuProps>((props, ref) => {

    const [curTool, setCurTool] = React.useState<tool>(tool.draw);

    ///////////

	function activateSelectTool() {
		const editor = props.getTlEditor();
		if (!editor) return;
		editor.setCurrentTool('select');
		setCurTool(tool.select);
		props.onActivateTool?.('select');
	}
	function activateDrawTool() {
		const editor = props.getTlEditor();
		if (!editor) return;
		editor.setCurrentTool('draw');
		setCurTool(tool.draw);
		props.onActivateTool?.('draw');
	}
	function activateEraseTool() {
		const editor = props.getTlEditor();
		if (!editor) return;
		editor.setCurrentTool('eraser');
		setCurTool(tool.eraser);
		props.onActivateTool?.('eraser');
	}

    ///////////
    ///////////

    return <>
        <div
            ref = {ref}
            className = {classNames([
                'ink_menu-bar',
                'ink_menu-bar_full',
            ])}
        >
            {/* <div
                className='ink_quick-menu'
            >
                <button
                    onPointerDown={undo}
                    disabled={!canUndo}
                >
                    <UndoIcon/>
                </button>
                <button
                    onPointerDown={redo}
                    disabled={!canRedo}
                >
                    <RedoIcon/>
                </button>
            </div> */}
            <div
                className='ink_tool-menu'
            >
                <TooltipButton
                    tooltip='Select'
                    onClick={activateSelectTool}
                    disabled={curTool === tool.select}
                >
                    <SelectIcon/>
                </TooltipButton>
                <TooltipButton
                    tooltip='Draw'
                    onClick={activateDrawTool}
                    disabled={curTool === tool.draw}
                >
                    <DrawIcon/>
                </TooltipButton>
                <TooltipButton
                    tooltip='Erase'
                    onClick={activateEraseTool}
                    disabled={curTool === tool.eraser}
                >
                    <EraseIcon/>
                </TooltipButton>
            </div>
            <div
                className='ink_other-menu'
            >
                
            </div>
        </div>
    </>;

});

export default DrawingMenu;