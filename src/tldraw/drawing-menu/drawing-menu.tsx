import "./drawing-menu.scss";
import * as React from "react";
import { SelectIcon } from "src/graphics/icons/select-icon";
import { EraseIcon } from "src/graphics/icons/erase-icon";
import { Editor } from "@tldraw/tldraw";
import { DrawIcon } from "src/graphics/icons/draw-icon";
import classNames from "classnames";
import {
    DRAWING_COLOR_PRESETS,
    DRAWING_SIZE_PRESETS,
    applyDrawingPreset,
    type DrawingMarkTool,
    type DrawingPresetColor,
    type DrawingPresetSize,
} from "./drawing-tool-presets";

//////////
//////////

export enum tool {
	select = 'select',
	draw = 'draw',
	highlight = 'highlight',
	eraser = 'eraser',
}
interface DrawingMenuProps {
    getTlEditor: () => Editor | undefined,
}

export const DrawingMenu = React.forwardRef<HTMLDivElement, DrawingMenuProps>((props, ref) => {

    const [curTool, setCurTool] = React.useState<tool>(tool.draw);
    const [lastMarkTool, setLastMarkTool] = React.useState<DrawingMarkTool>('draw');
    const [color, setColor] = React.useState<DrawingPresetColor>('black');
    const [size, setSize] = React.useState<DrawingPresetSize>('m');

    ///////////

	function activateSelectTool() {
		const editor = props.getTlEditor();
		if (!editor) return;
		editor.setCurrentTool('select');
		setCurTool(tool.select);

	}
	function activateDrawTool() {
		activateMarkTool('draw');
	}
	function activateHighlightTool() {
		activateMarkTool('highlight');
	}
	function activateEraseTool() {
		const editor = props.getTlEditor();
		if (!editor) return;
		editor.setCurrentTool('eraser');
		setCurTool(tool.eraser);
	}
	function activateMarkTool(nextTool: DrawingMarkTool) {
		const editor = props.getTlEditor();
		if (!editor) return;
		applyDrawingPreset(editor, { color, size, tool: nextTool });
		setLastMarkTool(nextTool);
		setCurTool(nextTool === 'draw' ? tool.draw : tool.highlight);
	}
	function activateColor(nextColor: DrawingPresetColor) {
		const editor = props.getTlEditor();
		if (!editor) return;
		setColor(nextColor);
		applyDrawingPreset(editor, { color: nextColor, size, tool: lastMarkTool });
		setCurTool(lastMarkTool === 'draw' ? tool.draw : tool.highlight);
	}
	function activateSize(nextSize: DrawingPresetSize) {
		const editor = props.getTlEditor();
		if (!editor) return;
		setSize(nextSize);
		applyDrawingPreset(editor, { color, size: nextSize, tool: lastMarkTool });
		setCurTool(lastMarkTool === 'draw' ? tool.draw : tool.highlight);
	}

    ///////////
    ///////////

    return <>
        <div
            ref = {ref}
            className = {classNames([
                'ink_menu-bar',
                'ink_menu-bar_full',
                'ink_drawing-menu',
            ])}
        >
            <div
                className='ink_tool-menu'
            >
                <button
					type='button'
					title='Select'
					aria-label='Select'
					aria-pressed={curTool === tool.select}
                    onPointerDown={activateSelectTool}
                    disabled={curTool === tool.select}
                >
                    <SelectIcon/>
                </button>
                <button
					type='button'
					title='Pen'
					aria-label='Pen'
					aria-pressed={curTool === tool.draw}
                    onPointerDown={activateDrawTool}
                    disabled={curTool === tool.draw}
                >
                    <DrawIcon/>
                </button>
                <button
					type='button'
					title='Highlighter'
					aria-label='Highlighter'
					aria-pressed={curTool === tool.highlight}
					onPointerDown={activateHighlightTool}
					disabled={curTool === tool.highlight}
				>
					<span className='ink_highlighter-icon' aria-hidden='true'/>
				</button>
				<button
					type='button'
					title='Eraser'
					aria-label='Eraser'
					aria-pressed={curTool === tool.eraser}
                    onPointerDown={activateEraseTool}
                    disabled={curTool === tool.eraser}
                >
                    <EraseIcon/>
                </button>
            </div>
            <div
				className={classNames('ink_other-menu', 'ink_drawing-presets', {
					'ink_drawing-presets_highlighter': lastMarkTool === 'highlight',
				})}
				aria-label='Drawing presets'
            >
				<div className='ink_drawing-preset-group' role='group' aria-label='Color'>
					{DRAWING_COLOR_PRESETS.map((preset) => (
						<button
							type='button'
							key={preset.value}
							className={classNames(
								'ink_drawing-preset-button',
								'ink_drawing-color-button',
								`ink_drawing-color_${preset.value}`,
							)}
							title={preset.label}
							aria-label={preset.label}
							aria-pressed={color === preset.value}
							onPointerDown={() => activateColor(preset.value)}
						>
							<span aria-hidden='true'/>
						</button>
					))}
				</div>
				<span className='ink_drawing-preset-divider' aria-hidden='true'/>
				<div className='ink_drawing-preset-group' role='group' aria-label='Pen size'>
					{DRAWING_SIZE_PRESETS.map((preset) => (
						<button
							type='button'
							key={preset.value}
							className={classNames(
								'ink_drawing-preset-button',
								'ink_drawing-size-button',
								`ink_drawing-size_${preset.value}`,
							)}
							title={preset.label}
							aria-label={preset.label}
							aria-pressed={size === preset.value}
							onPointerDown={() => activateSize(preset.value)}
						>
							<span aria-hidden='true'/>
						</button>
					))}
				</div>
            </div>
        </div>
    </>;

});

export default DrawingMenu;