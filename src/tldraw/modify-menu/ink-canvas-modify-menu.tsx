import './modify-menu.scss';
import * as React from 'react';
import { UndoIcon } from 'src/graphics/icons/undo-icon';
import { RedoIcon } from 'src/graphics/icons/redo-icon';
import classNames from 'classnames';
import { TooltipButton } from 'src/components/jsx-components/tooltip-button/tooltip-button';
import type { InkCanvasEditor } from 'src/ink-canvas/types';

//////////
//////////

interface InkCanvasModifyMenuProps {
	getEditor: () => InkCanvasEditor | undefined;
	onStoreChange: () => void;
}

export const InkCanvasModifyMenu = React.forwardRef<HTMLDivElement, InkCanvasModifyMenuProps>((props, ref) => {

	const [canUndo, setCanUndo] = React.useState<boolean>(false);
	const [canRedo, setCanRedo] = React.useState<boolean>(false);

	// Poll the editor for undo/redo state since the ink-canvas UndoManager
	// notifies via listeners but React state needs explicit updates.
	React.useEffect(() => {
		const intervalId = window.setInterval(() => {
			const editor = props.getEditor();
			if (!editor) return;
			setCanUndo(editor.canUndo());
			setCanRedo(editor.canRedo());
		}, 200);

		return () => window.clearInterval(intervalId);
	}, []);

	///////////

	function undo() {
		const editor = props.getEditor();
		if (!editor) return;
		editor.undo();
		props.onStoreChange();
	}

	function redo() {
		const editor = props.getEditor();
		if (!editor) return;
		editor.redo();
		props.onStoreChange();
	}

	///////////
	///////////

	return <>
		<div
			ref={ref}
			className={classNames([
				'ink_menu-bar',
				'ink_menu-bar_floating',
			])}
		>
			<div className='ink_modify-menu'>
				<TooltipButton
					tooltip='Redo'
					onClick={redo}
					disabled={!canRedo}
				>
					<RedoIcon />
				</TooltipButton>
				<TooltipButton
					tooltip='Undo'
					onClick={undo}
					disabled={!canUndo}
				>
					<UndoIcon />
				</TooltipButton>
			</div>
		</div>
	</>;
});

export default InkCanvasModifyMenu;
