import './drawing-menu.scss';
import '../writing-menu/writing-menu.scss';
import * as React from 'react';
import { SelectIcon } from 'src/graphics/icons/select-icon';
import { EraseIcon } from 'src/graphics/icons/erase-icon';
import { DrawIcon } from 'src/graphics/icons/draw-icon';
import { ExpandIcon } from 'src/graphics/icons/expand-icon';
import { PointerIcon } from 'src/graphics/icons/pointer-icon';
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

function inkToolToMenuTool(inkTool: InkTool): tool {
	if (inkTool === 'select') return tool.select;
	if (inkTool === 'erase') return tool.eraser;
	return tool.draw;
}

interface InkCanvasDrawingMenuProps {
	getEditor: () => InkCanvasEditor | undefined;
	onStoreChange: () => void;
	onActivateTool?: (tool: 'draw' | 'erase' | 'select') => void;
	onExpandClick?: () => void;
	showFingerDrawingToggle?: boolean;
	isFingerDrawingActive?: boolean;
	onFingerDrawingToggle?: () => void;
	embedId?: string;
	workspaceLeafId?: string;
	plugin?: import('src/main').default;
}

export const InkCanvasDrawingMenu = React.forwardRef<HTMLDivElement, InkCanvasDrawingMenuProps>((props, ref) => {

	const [curTool, setCurTool] = React.useState<tool>(tool.draw);

	// Sync toolbar highlight when the canvas changes tool (e.g. ⌘/Ctrl temporary erase).
	React.useEffect(() => {
		let unsubscribe: (() => void) | undefined;
		let pollId: number | undefined;

		const trySubscribe = (): boolean => {
			const editor = props.getEditor();
			if (!editor?.subscribeToolChange) return false;
			unsubscribe = editor.subscribeToolChange((inkTool) => {
				setCurTool(inkToolToMenuTool(inkTool));
			});
			return true;
		};

		if (!trySubscribe()) {
			pollId = window.setInterval(() => {
				if (trySubscribe() && pollId !== undefined) {
					window.clearInterval(pollId);
					pollId = undefined;
				}
			}, 100);
		}

		return () => {
			if (pollId !== undefined) window.clearInterval(pollId);
			unsubscribe?.();
		};
	}, [props.getEditor]);

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
			{(props.showFingerDrawingToggle || props.onExpandClick) && (
				<div className='ink_quick-menu'>
					{props.onExpandClick && (
						<TooltipButton
							tooltip='Open in full view'
							onClick={() => props.onExpandClick?.()}
						>
							<ExpandIcon />
						</TooltipButton>
					)}
					{props.showFingerDrawingToggle && (
						<TooltipButton
							tooltip={props.isFingerDrawingActive ? 'Enable drawing with finger' : 'Disable drawing with finger'}
							className={props.isFingerDrawingActive ? 'ink_menu-toggle--active' : undefined}
							onClick={() => props.onFingerDrawingToggle?.()}
						>
							<PointerIcon />
						</TooltipButton>
					)}
				</div>
			)}
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
