import "./writing-menu.scss";
import * as React from "react";
import { WriteIcon } from "src/graphics/icons/write-icon";
import { EraseIcon } from "src/graphics/icons/erase-icon";
import { SelectIcon } from "src/graphics/icons/select-icon";
import { UndoIcon } from "src/graphics/icons/undo-icon";
import { RedoIcon } from "src/graphics/icons/redo-icon";
import { Editor } from "@tldraw/tldraw";
import { Activity, getActivityType, silentlyChangeStore } from "src/utils/tldraw-helpers";
import classNames from "classnames";

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
}

export const WritingMenu = (props: WritingMenuProps) => {

    const [curTool, setCurTool] = React.useState<tool>(tool.draw);

    ///////////

    function undo() {
		const tlEditor = props.getTlEditor();
		if (!tlEditor) return;
		silentlyChangeStore( tlEditor, () => {
			tlEditor.undo();
		});
		props.onStoreChange(tlEditor)
	}
	function redo() {
		const tlEditor = props.getTlEditor();
		if (!tlEditor) return;
		silentlyChangeStore( tlEditor, () => {
			tlEditor.redo();
		});
		props.onStoreChange(tlEditor)

	}
	function activateSelectTool() {
		const tlEditor = props.getTlEditor();
		if (!tlEditor) return;
		tlEditor.setCurrentTool('select');
		setCurTool(tool.select);

	}
	function activateDrawTool() {
		const tlEditor = props.getTlEditor();
		if (!tlEditor) return;
		tlEditor.setCurrentTool('draw');
		setCurTool(tool.draw);
	}
	function activateEraseTool() {
		const tlEditor = props.getTlEditor();
		if (!tlEditor) return;
		tlEditor.setCurrentTool('eraser');
		setCurTool(tool.eraser);
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
            <div
                className='ink_tool-menu'
            >
                <button
                    onPointerDown={activateSelectTool}
                    disabled={curTool === tool.select}
                >
                    <SelectIcon/>
                </button>
                <button
                    onPointerDown={activateDrawTool}
                    disabled={curTool === tool.draw}
                >
                    <WriteIcon/>
                </button>
                <button
                    onPointerDown={activateEraseTool}
                    disabled={curTool === tool.eraser}
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

};

export default WritingMenu;