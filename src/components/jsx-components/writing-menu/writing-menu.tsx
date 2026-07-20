import "./writing-menu.scss";
import * as React from "react";
import { WriteIcon } from "src/graphics/icons/write-icon";
import { EraseIcon } from "src/graphics/icons/erase-icon";
import { SelectIcon } from "src/graphics/icons/select-icon";
import { ExpandIcon } from "src/graphics/icons/expand-icon";
import { Editor } from "@tldraw/tldraw";
import classNames from "classnames";
import { TooltipButton } from "src/components/jsx-components/tooltip-button/tooltip-button";

//////////
//////////

export enum tool {
	select = 'select',
	draw = 'draw',
	eraser = 'eraser',
}
interface WritingMenuProps {
	getTlEditor: () => Editor | undefined,
	onStoreChange: (elEditor: Editor) => void,
	onActivateTool?: (activatedTool: tool) => void,
	onExpandClick?: () => void,
	/** When provided, local undo/redo sync with the unified stack. */
	embedId?: string,
	workspaceLeafId?: string,
	plugin?: import("src/main").default,
}

export const WritingMenu = (props: WritingMenuProps) => {

    const [curTool, setCurTool] = React.useState<tool>(tool.draw);

    ///////////

	function activateSelectTool() {
		const tlEditor = props.getTlEditor();
		if (!tlEditor) return;
		tlEditor.setCurrentTool('select');
		setCurTool(tool.select);
		props.onActivateTool?.(tool.select);

	}
	function activateDrawTool() {
		const tlEditor = props.getTlEditor();
		if (!tlEditor) return;
		tlEditor.setCurrentTool('draw');
		setCurTool(tool.draw);
		props.onActivateTool?.(tool.draw);
	}
	function activateEraseTool() {
		const tlEditor = props.getTlEditor();
		if (!tlEditor) return;
		tlEditor.setCurrentTool('eraser');
		setCurTool(tool.eraser);
		props.onActivateTool?.(tool.eraser);
	}

    ///////////
    ///////////

    return <>
        <div
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
            {props.onExpandClick && (
                <div className='ink_quick-menu'>
                    <TooltipButton
                        tooltip='Open in full view'
                        onClick={() => props.onExpandClick?.()}
                    >
                        <ExpandIcon />
                    </TooltipButton>
                </div>
            )}
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
                    tooltip='Write'
                    onClick={activateDrawTool}
                    disabled={curTool === tool.draw}
                >
                    <WriteIcon/>
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

};

export default WritingMenu;