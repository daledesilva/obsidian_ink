import "./drawing-menu.scss";
import * as React from "react";
import { UndoIcon } from "src/graphics/icons/undo-icon";
import { RedoIcon } from "src/graphics/icons/redo-icon";
import { SelectIcon } from "src/graphics/icons/select-icon";
import { EraseIcon } from "src/graphics/icons/erase-icon";
import { Editor } from "@tldraw/tldraw";
import { DrawIcon } from "src/graphics/icons/draw-icon";
import classNames from "classnames";
import { TooltipButton } from "src/components/jsx-components/tooltip-button/tooltip-button";
import { silentlyChangeStore } from "src/components/formats/v1-code-blocks/utils/tldraw-helpers";
import {
	setProgrammaticUndoInProgress,
	setProgrammaticRedoInProgress,
	popEmbedUndoAndPushToRedo,
	popEmbedRedoAndPushToUndo,
} from "src/logic/undo-redo/unified-undo-stack";

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

	function undo() {
		const editor = props.getTlEditor();
		if (!editor) return;
		const embedId = props.embedId;
		const leafId = props.workspaceLeafId;
		const plugin = props.plugin;
		if (embedId && leafId && plugin) {
			setProgrammaticUndoInProgress(true, plugin);
			try {
				silentlyChangeStore(editor, () => editor.undo());
				popEmbedUndoAndPushToRedo(leafId, embedId);
			} finally {
				const pluginRef = plugin;
				setTimeout(() => setProgrammaticUndoInProgress(false, pluginRef), 50);
			}
		} else {
			silentlyChangeStore(editor, () => editor.undo());
		}
		props.onStoreChange(editor);
	}
	function redo() {
		const editor = props.getTlEditor();
		if (!editor) return;
		const embedId = props.embedId;
		const leafId = props.workspaceLeafId;
		const plugin = props.plugin;
		if (embedId && leafId && plugin) {
			setProgrammaticRedoInProgress(true, plugin);
			try {
				silentlyChangeStore(editor, () => editor.redo());
				popEmbedRedoAndPushToUndo(leafId, embedId);
			} finally {
				const pluginRef = plugin;
				setTimeout(() => setProgrammaticRedoInProgress(false, pluginRef), 50);
			}
		} else {
			silentlyChangeStore(editor, () => editor.redo());
		}
		props.onStoreChange(editor);
	}
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