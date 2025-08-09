import "./modify-menu.scss";
import * as React from "react";
import { UndoIcon } from "src/graphics/icons/undo-icon";
import { RedoIcon } from "src/graphics/icons/redo-icon";
import { Editor } from "@tldraw/tldraw";
import { silentlyChangeStore } from "src/utils/tldraw-helpers";
import classNames from "classnames";

//////////
//////////

interface ModifyMenuProps {
    getTlEditor: () => Editor | undefined,
    onStoreChange: (elEditor: Editor) => void,
}

export const ModifyMenu = React.forwardRef<HTMLDivElement, ModifyMenuProps>((props, ref) => {

	const [canUndo, setCanUndo] = React.useState<boolean>(false);
	const [canRedo, setCanRedo] = React.useState<boolean>(false);

    React.useEffect( () => {
        
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

    ///////////
    ///////////

    return <>
        <div
            ref = {ref}
            className = {classNames([
                'ink_menu-bar',
                'ink_menu-bar_floating'
            ])}
        >
            <div
                className='ink_modify-menu'
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
        </div>
    </>;

});

export default ModifyMenu;