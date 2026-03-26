import "./writing-menu.scss";
import * as React from "react";
import { WriteIcon } from "src/graphics/icons/write-icon";
import { EraseIcon } from "src/graphics/icons/erase-icon";
import { SelectIcon } from "src/graphics/icons/select-icon";
import { Editor } from "@tldraw/tldraw";
import classNames from "classnames";
import { silentlyChangeStore } from "src/components/formats/current/utils/tldraw-helpers";
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
interface WritingMenuProps {
	getTlEditor: () => Editor | undefined,
	onStoreChange: (elEditor: Editor) => void,
	/** When provided, local undo/redo sync with the unified stack. */
	embedId?: string,
	workspaceLeafId?: string,
	plugin?: import("src/main").default,
}

export const WritingMenu = (props: WritingMenuProps) => {

    const [curTool, setCurTool] = React.useState<tool>(tool.draw);
    const [canUndo, setCanUndo] = React.useState<boolean>(false);
    const [canRedo, setCanRedo] = React.useState<boolean>(false);

    ///////////

	function undo() {
		const tlEditor = props.getTlEditor();
		if (!tlEditor) return;
		const embedId = props.embedId;
		const leafId = props.workspaceLeafId;
		const plugin = props.plugin;
		if (embedId && leafId && plugin) {
			setProgrammaticUndoInProgress(true, plugin);
			try {
				silentlyChangeStore(tlEditor, () => tlEditor.undo());
				popEmbedUndoAndPushToRedo(leafId, embedId);
			} finally {
				const pluginRef = plugin;
				setTimeout(() => setProgrammaticUndoInProgress(false, pluginRef), 50);
			}
		} else {
			silentlyChangeStore(tlEditor, () => tlEditor.undo());
		}
		setCanUndo(tlEditor.getCanUndo());
		props.onStoreChange(tlEditor);
	}
	function redo() {
		const tlEditor = props.getTlEditor();
		if (!tlEditor) return;
		const embedId = props.embedId;
		const leafId = props.workspaceLeafId;
		const plugin = props.plugin;
		if (embedId && leafId && plugin) {
			setProgrammaticRedoInProgress(true, plugin);
			try {
				silentlyChangeStore(tlEditor, () => tlEditor.redo());
				popEmbedRedoAndPushToUndo(leafId, embedId);
			} finally {
				const pluginRef = plugin;
				setTimeout(() => setProgrammaticRedoInProgress(false, pluginRef), 50);
			}
		} else {
			silentlyChangeStore(tlEditor, () => tlEditor.redo());
		}
		setCanRedo(tlEditor.getCanRedo());
		props.onStoreChange(tlEditor);
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