import "./drawing-menu.scss";
import * as React from "react";
import { UndoIcon } from "src/graphics/icons/undo-icon";
import { RedoIcon } from "src/graphics/icons/redo-icon";
import { SelectIcon } from "src/graphics/icons/select-icon";
import { EraseIcon } from "src/graphics/icons/erase-icon";
import { DrawIcon } from "src/graphics/icons/draw-icon";
import { Editor, DefaultColorStyle, DefaultSizeStyle } from "@tldraw/tldraw";
import { silentlyChangeStore } from "src/components/formats/v1-code-blocks/utils/tldraw-helpers";

//////////
//////////

export enum tool {
	select = 'select',
	draw = 'draw',
	eraser = 'eraser',
}

const COLORS = [
	{ name: 'white',      hex: '#ffffff' },
	{ name: 'light-blue', hex: '#74b8e5' },
	{ name: 'light-red',  hex: '#f87171' },
	{ name: 'yellow',     hex: '#fcd34d' },
	{ name: 'green',      hex: '#4ade80' },
] as const;

const SIZES = [
	{ name: 's',  thickness: 2  },
	{ name: 'm',  thickness: 5  },
	{ name: 'l',  thickness: 10 },
	{ name: 'xl', thickness: 18 },
] as const;

type ColorName = typeof COLORS[number]['name'];
type SizeName  = typeof SIZES[number]['name'];

interface DrawingMenuProps {
    getTlEditor: () => Editor | undefined,
    onStoreChange: (elEditor: Editor) => void,
}

export const DrawingMenu = React.forwardRef<HTMLDivElement, DrawingMenuProps>((props, ref) => {

    const [curTool,  setCurTool]  = React.useState<tool>(tool.draw);
	const [canUndo,  setCanUndo]  = React.useState<boolean>(false);
	const [canRedo,  setCanRedo]  = React.useState<boolean>(false);
    const [curColor, setCurColor] = React.useState<ColorName>('white');
    const [curSize,  setCurSize]  = React.useState<SizeName>('m');

    React.useEffect( () => {
        let removeUserActionListener: () => void;

        const mountDelayMs = 100;
        setTimeout( () => {
            const tlEditor = props.getTlEditor();
            if(!tlEditor) return;

            let timeout: NodeJS.Timeout;
            removeUserActionListener = tlEditor.store.listen((entry) => {
                clearTimeout(timeout);
                timeout = setTimeout( () => {
                    setCanUndo( tlEditor.getCanUndo() );
                    setCanRedo( tlEditor.getCanRedo() );
                }, 100);
            }, {
                source: 'all',
                scope: 'all'
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
	function activateColor(colorName: ColorName) {
		const editor = props.getTlEditor();
		if (!editor) return;
		editor.setStyleForNextShapes(DefaultColorStyle, colorName);
		setCurColor(colorName);
		if (curTool !== tool.draw) {
			editor.setCurrentTool('draw');
			setCurTool(tool.draw);
		}
	}
	function zoomIn() {
		const editor = props.getTlEditor();
		if (!editor) return;
		const camera = editor.getCamera();
		const newZ = Math.min(camera.z * 1.3, 10);
		editor.setCameraOptions({ isLocked: false });
		editor.setCamera({ ...camera, z: newZ });
		editor.setCameraOptions({ isLocked: true });
	}
	function zoomOut() {
		const editor = props.getTlEditor();
		if (!editor) return;
		const camera = editor.getCamera();
		const newZ = Math.max(camera.z * 0.77, 0.05);
		editor.setCameraOptions({ isLocked: false });
		editor.setCamera({ ...camera, z: newZ });
		editor.setCameraOptions({ isLocked: true });
	}
	function activateSize(sizeName: SizeName) {
		const editor = props.getTlEditor();
		if (!editor) return;
		editor.setStyleForNextShapes(DefaultSizeStyle, sizeName);
		setCurSize(sizeName);
		if (curTool !== tool.draw) {
			editor.setCurrentTool('draw');
			setCurTool(tool.draw);
		}
	}

    ///////////
    ///////////

    return <>
        <div
            ref = {ref}
            className = 'ink_menu-bar'
        >
            <div className='ink_quick-menu'>
                <button onPointerDown={undo} disabled={!canUndo}>
                    <UndoIcon/>
                </button>
                <button onPointerDown={redo} disabled={!canRedo}>
                    <RedoIcon/>
                </button>
                <button onPointerDown={zoomOut} aria-label="Zoom out">－</button>
                <button onPointerDown={zoomIn}  aria-label="Zoom in">＋</button>
            </div>
            <div className='ink_tool-menu'>
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
            <div className='ink_other-menu'>
                <div className='ink_size-group'>
                    {SIZES.map(({ name, thickness }) => (
                        <button
                            key={name}
                            className={`ink_size-btn${curSize === name ? ' ink_size-btn--active' : ''}`}
                            onPointerDown={() => activateSize(name)}
                            aria-label={name}
                        >
                            <div
                                className='ink_size-dot'
                                style={{ width: thickness, height: thickness } as React.CSSProperties}
                            />
                        </button>
                    ))}
                </div>
                <div className='ink_color-group'>
                    {COLORS.map(({ name, hex }) => (
                        <button
                            key={name}
                            className={`ink_color-swatch${curColor === name ? ' ink_color-swatch--active' : ''}`}
                            onPointerDown={() => activateColor(name)}
                            style={{ '--swatch-color': hex } as React.CSSProperties}
                            aria-label={name}
                        />
                    ))}
                </div>
            </div>
        </div>
    </>;

});

export default DrawingMenu;
