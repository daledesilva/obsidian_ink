import { MarkdownView, Platform } from 'obsidian';
import type InkPlugin from 'src/main';

const COMMAND_UNIFIED_UNDO_ID = 'unified-undo';
const COMMAND_UNIFIED_REDO_ID = 'unified-redo';

function createSyntheticUndoRedoKeyboardEvent(shiftKey: boolean): KeyboardEvent {
	const isMacLikePlatform = Platform.isMacOS || Platform.isIosApp;

	return new KeyboardEvent('keydown', {
		key: 'z',
		code: 'KeyZ',
		metaKey: isMacLikePlatform,
		ctrlKey: !isMacLikePlatform,
		shiftKey,
		bubbles: true,
		cancelable: true,
	});
}

function dispatchSyntheticUndoRedoKeydown(shiftKey: boolean): boolean {
	// Route through the global document keydown handler.
	// If the unified keydown handler intercepts (preventDefault), dispatchEvent returns false.
	return document.dispatchEvent(createSyntheticUndoRedoKeyboardEvent(shiftKey));
}

function executeOrDispatchUnifiedUndoRedo(plugin: InkPlugin, shiftKey: boolean): void {
	const wasHandledByUnifiedKeydownHandler = dispatchSyntheticUndoRedoKeydown(shiftKey) === false;
	if (wasHandledByUnifiedKeydownHandler) return;

	// Otherwise, don't rely on the synthetic event reaching CodeMirror (it may not
	// if the editor isn't focused, e.g. when triggered from the mobile toolbar).
	const editor = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
	if (!editor) return;

	if (shiftKey) editor.redo();
	else editor.undo();
}

export function dispatchSyntheticUndoKeydown(plugin: InkPlugin): void {
	executeOrDispatchUnifiedUndoRedo(plugin, false);
}

export function dispatchSyntheticRedoKeydown(plugin: InkPlugin): void {
	executeOrDispatchUnifiedUndoRedo(plugin, true);
}

export function registerUnifiedUndoRedoCommands(plugin: InkPlugin): void {
	plugin.addCommand({
		id: COMMAND_UNIFIED_UNDO_ID,
		name: 'Unified undo',
		callback: () => dispatchSyntheticUndoKeydown(plugin),
	});

	plugin.addCommand({
		id: COMMAND_UNIFIED_REDO_ID,
		name: 'Unified redo',
		callback: () => dispatchSyntheticRedoKeydown(plugin),
	});
}

