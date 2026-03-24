import { keymap, type EditorView } from '@codemirror/view';
import type InkPlugin from 'src/main';
import { getActiveEmbedId } from 'src/logic/undo-redo/ink-editor-registry';
import {
	consumeDomUnifiedUndoRedoHandled,
	executeUnifiedRedo,
	executeUnifiedUndo,
} from 'src/logic/undo-redo/keyboard-handler';

type UnifiedUndoRedoIntent = 'undo' | 'redo';

function unifiedKeymapCommand(plugin: InkPlugin, intent: UnifiedUndoRedoIntent) {
	return (_view: EditorView) => {
		// If the DOM fallback already executed unified undo/redo for this exact keypress,
		// return `true` so CodeMirror doesn't fall back to its native undo/redo.
		if (consumeDomUnifiedUndoRedoHandled(plugin, intent)) return true;

		const activeEmbedId = getActiveEmbedId();
		if (activeEmbedId === null) return false;

		if (intent === 'undo') executeUnifiedUndo(plugin, activeEmbedId);
		else executeUnifiedRedo(plugin, activeEmbedId);

		return true;
	};
}

export function unifiedUndoKeymapCommand(plugin: InkPlugin) {
	return unifiedKeymapCommand(plugin, 'undo');
}

export function unifiedRedoKeymapCommand(plugin: InkPlugin) {
	return unifiedKeymapCommand(plugin, 'redo');
}

export function unifiedUndoRedoKeymapExtension(plugin: InkPlugin) {
	return keymap.of([
		{ key: 'Mod-z', run: unifiedUndoKeymapCommand(plugin) },
		{ key: 'Shift-Mod-z', run: unifiedRedoKeymapCommand(plugin) },
	]);
}

export function registerUnifiedUndoRedoKeymap(plugin: InkPlugin): void {
	plugin.registerEditorExtension([unifiedUndoRedoKeymapExtension(plugin)]);
}

