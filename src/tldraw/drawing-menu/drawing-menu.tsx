import "./drawing-menu.scss";
import * as React from "react";
import { UndoIcon } from "src/graphics/icons/undo-icon";
import { RedoIcon } from "src/graphics/icons/redo-icon";
import { SelectIcon } from "src/graphics/icons/select-icon";
import { EraseIcon } from "src/graphics/icons/erase-icon";
import { Editor } from "@tldraw/tldraw";
import { silentlyChangeStore } from "src/utils/tldraw-helpers";
import { DrawIcon } from "src/graphics/icons/draw-icon";

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
}

export const DrawingMenu = React.forwardRef<HTMLDivElement, DrawingMenuProps>((props, ref) => {

    const [curTool, setCurTool] = React.useState<tool>(tool.draw);
	const [canUndo, setCanUndo] = React.useState<boolean>(false);
	const [canRedo, setCanRedo] = React.useState<boolean>(false);

    React.useEffect( () => {
        // console.log('MENUBAR MOUNTED');
        
        let removeUserActionListener: () => void;
        
        const mountDelayMs = 100;
        setTimeout( () => {
            const tlEditor = props.getTlEditor();
            if(!tlEditor) return;

            let timeout: NodeJS.Timeout;
            removeUserActionListener = tlEditor.store.listen((entry) => {
                clearTimeout(timeout);
                timeout = setTimeout( () => { // TODO: Create a debounce helper
                    setCanUndo( tlEditor.getCanUndo() );
                    setCanRedo( tlEditor.getCanRedo() );
                }, 100);
            }, {
                source: 'all',
                scope: 'all'	// Filters some things like camera movement changes. But Not sure it's locked down enough, so leaving as all.
            })
        }, mountDelayMs);

        return () => removeUserActionListener();
    }, []);

    ///////////

    function undo() {
		const editor = props.getTlEditor();
		if (!editor) return;
		silentlyChangeStore( editor, () => {
			editor.undo();
		});
		props.onStoreChange(editor)
	}
	function redo() {
		const editor = props.getTlEditor();
		if (!editor) return;
		silentlyChangeStore( editor, () => {
			editor.redo();
		});
		props.onStoreChange(editor)

	}
	function activateSelectTool() {
		const editor = props.getTlEditor();
		if (!editor) return;
		editor.setCurrentTool('select');
		setCurTool(tool.select);

	}
	function activateDrawTool() {
		const editor = props.getTlEditor();
		if (!editor) return;
		editor.setCurrentTool('draw');
		setCurTool(tool.draw);
	}
	function activateEraseTool() {
		const editor = props.getTlEditor();
		if (!editor) return;
		editor.setCurrentTool('eraser');
		setCurTool(tool.eraser);
	}

    ///////////
    ///////////

    return <>
        <div
            ref = {ref}
            className = 'ink_menu-bar'
        >
            <div
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
            </div>
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
                    <DrawIcon/>
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

});

export default DrawingMenu;