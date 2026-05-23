import './drawing-menu.scss';
import * as React from 'react';
import { SelectIcon } from 'src/graphics/icons/select-icon';
import { EraseIcon } from 'src/graphics/icons/erase-icon';
import { DrawIcon } from 'src/graphics/icons/draw-icon';
import classNames from 'classnames';
import { TooltipButton } from 'src/components/jsx-components/tooltip-button/tooltip-button';
import {
	setProgrammaticUndoInProgress,
	setProgrammaticRedoInProgress,
	popEmbedUndoAndPushToRedo,
	popEmbedRedoAndPushToUndo,
} from 'src/logic/undo-redo/unified-undo-stack';
import type { InkCanvasEditor, InkTool } from 'src/ink-canvas/types';

//////////
//////////

export enum tool {
	select = 'select',
	draw = 'draw',
	eraser = 'eraser',
}

interface InkCanvasDrawingMenuProps {
	getEditor: () => InkCanvasEditor | undefined;
	onStoreChange: () => void;
	onActivateTool?: (tool: 'draw' | 'erase' | 'select') => void;
	embedId?: string;
	workspaceLeafId?: string;
	plugin?: import('src/main').default;
}

export const InkCanvasDrawingMenu = React.forwardRef<HTMLDivElement, InkCanvasDrawingMenuProps>((props, ref) => {

	const [curTool, setCurTool] = React.useState<tool>(tool.draw);

	///////////

	function undo() {
		const editor = props.getEditor();
		if (!editor) return;
		const embedId = props.embedId;
		const leafId = props.workspaceLeafId;
		const plugin = props.plugin;
		if (embedId && leafId && plugin) {
			setProgrammaticUndoInProgress(true, plugin);
			try {
				editor.undo();
				popEmbedUndoAndPushToRedo(leafId, embedId);
			} finally {
				const pluginRef = plugin;
				window.setTimeout(() => setProgrammaticUndoInProgress(false, pluginRef), 50);
			}
		} else {
			editor.undo();
		}
		props.onStoreChange();
	}

	function redo() {
		const editor = props.getEditor();
		if (!editor) return;
		const embedId = props.embedId;
		const leafId = props.workspaceLeafId;
		const plugin = props.plugin;
		if (embedId && leafId && plugin) {
			setProgrammaticRedoInProgress(true, plugin);
			try {
				editor.redo();
				popEmbedRedoAndPushToUndo(leafId, embedId);
			} finally {
				const pluginRef = plugin;
				window.setTimeout(() => setProgrammaticRedoInProgress(false, pluginRef), 50);
			}
		} else {
			editor.redo();
		}
		props.onStoreChange();
	}

	function activateSelectTool() {
		const editor = props.getEditor();
		if (!editor) return;
		editor.setTool('select');
		setCurTool(tool.select);
		props.onActivateTool?.('select');
	}

	function activateDrawTool() {
		const editor = props.getEditor();
		if (!editor) return;
		editor.setTool('draw');
		setCurTool(tool.draw);
		props.onActivateTool?.('draw');
	}

	function activateEraseTool() {
		const editor = props.getEditor();
		if (!editor) return;
		editor.setTool('erase');
		setCurTool(tool.eraser);
		props.onActivateTool?.('erase');
	}

	///////////
	///////////

	return <>
		<div
			ref={ref}
			className={classNames([
				'ink_menu-bar',
				'ink_menu-bar_full',
			])}
		>
			<div className='ink_tool-menu'>
				<TooltipButton
					tooltip='Select'
					onClick={activateSelectTool}
					disabled={curTool === tool.select}
				>
					<SelectIcon />
				</TooltipButton>
				<TooltipButton
					tooltip='Draw'
					onClick={activateDrawTool}
					disabled={curTool === tool.draw}
				>
					<DrawIcon />
				</TooltipButton>
				<TooltipButton
					tooltip='Erase'
					onClick={activateEraseTool}
					disabled={curTool === tool.eraser}
				>
					<EraseIcon />
				</TooltipButton>
			</div>
			<div className='ink_other-menu'>
			</div>
		</div>
	</>;
});

export default InkCanvasDrawingMenu;
