import "./writing-menu.scss";
import * as React from "react";
import { WriteIcon } from "src/graphics/icons/write-icon";
import { EraseIcon } from "src/graphics/icons/erase-icon";
import { SelectIcon } from "src/graphics/icons/select-icon";
import { UndoIcon } from "src/graphics/icons/undo-icon";
import { RedoIcon } from "src/graphics/icons/redo-icon";
import { Editor } from "@tldraw/tldraw";
import { Activity, getActivityType, silentlyChangeStore } from "src/components/formats/v1-code-blocks/utils/tldraw-helpers";

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
	const [canUndo, setCanUndo] = React.useState<boolean>(false);
	const [canRedo, setCanRedo] = React.useState<boolean>(false);

    React.useEffect( () => {
        // console.log('MENUBAR MOUNTED');
        
        let removeUserActionListener: () => void;
        
        // Arbitrary delay to know when editor has fully mounted and exists
        // TODO: Could try every 100ms until succeeds?
        const mountDelayMs = 200;
        setTimeout( () => {
            const tlEditor = props.getTlEditor();
            if(!tlEditor) return;

            let timeout: NodeJS.Timeout;
            removeUserActionListener = tlEditor.store.listen((entry) => {
                const activity = getActivityType(entry);
                if (activity === Activity.PointerMoved) return;
				
                clearTimeout(timeout);
                timeout = setTimeout( () => { // TODO: Create a debounce helper
                    setCanUndo( tlEditor.getCanUndo() );
                    setCanRedo( tlEditor.getCanRedo() );
                }, 100);
            }, {
                source: 'user',
                scope: 'all'	// Filters some things like camera movement changes. But Not sure it's locked down enough, so leaving as all.
            })
        }, mountDelayMs);

        return () => {
            removeUserActionListener()
        };
    }, []);

    ///////////

    function undo() {
		const tlEditor = props.getTlEditor();
		if (!tlEditor) return;
		silentlyChangeStore( tlEditor, () => {
			tlEditor.undo();
		});
        setCanUndo( tlEditor.getCanUndo() );
		props.onStoreChange(tlEditor)
	}
	function redo() {
		const tlEditor = props.getTlEditor();
		if (!tlEditor) return;
		silentlyChangeStore( tlEditor, () => {
			tlEditor.redo();
		});
        setCanRedo( tlEditor.getCanRedo() );
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