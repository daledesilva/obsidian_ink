/**
 * Global keydown handler for unified undo/redo when an ink embed is in edit mode.
 * Captures Mod+Z and Mod+Shift+Z so the custom stack is used instead of Obsidian's.
 * @see docs/undo-redo-implementation.md
 */

import { MarkdownView, Notice } from 'obsidian';
import type InkPlugin from 'src/main';
import { getActiveEmbedId, getEditor, getResizeApplier } from 'src/logic/undo-redo/ink-editor-registry';
import {
	syncUnifiedUndoHistory,
	isUndoStackEmpty,
	isRedoStackEmpty,
	popUndo,
	pushRedo,
	popRedo,
	pushUndo,
	notifyUndoExecuted,
	notifyRedoExecuted,
	getUndoStackSnapshot,
	setProgrammaticRedoInProgress,
	type UnifiedUndoEntry,
} from 'src/logic/undo-redo/unified-undo-stack';
function formatStackForLog(snapshot: readonly UnifiedUndoEntry[]): string {
	return '[' + snapshot.map(e => {
		if (e.type === 'obsidian') return 'Obsidian';
		if (e.type === 'embed-resize') return `EmbedResize:${e.embedId}`;
		return `Embed:${e.embedId}`;
	}).join(', ') + ']';
}
import { verbose } from 'src/logic/utils/log-to-console';

const EMPTY_UNDO_MESSAGE =
	'To undo further in Obsidian you must lock the Ink embed (which will discard any redo ability in the embed).';

function handleKeydown(plugin: InkPlugin, event: KeyboardEvent): void {
	const isUndo = (event.metaKey || event.ctrlKey) && event.key === 'z' && !event.shiftKey;
	const isRedo = (event.metaKey || event.ctrlKey) && event.key === 'z' && event.shiftKey;
	if (!isUndo && !isRedo) return;

	const activeEmbedId = getActiveEmbedId();
	if (activeEmbedId === null) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();

	syncUnifiedUndoHistory(activeEmbedId);

	if (isUndo) {
		if (isUndoStackEmpty()) {
			new Notice(EMPTY_UNDO_MESSAGE);
			return;
		}
		const entry = popUndo();
		if (!entry) return;
		notifyUndoExecuted(entry);
		executeUndo(plugin, entry, activeEmbedId);
		pushRedo(entry);
		verbose(`[undo-redo] Undo executed. Undo stack after: ${formatStackForLog(getUndoStackSnapshot())}`);
	} else {
		if (isRedoStackEmpty()) return;
		const entry = popRedo();
		if (!entry) return;
		notifyRedoExecuted(entry);
		setProgrammaticRedoInProgress(true, plugin);
		try {
			executeRedo(plugin, entry, activeEmbedId);
		} finally {
			// Clear flag after a tick; store.listen may run in a macrotask after editor.redo() returns
			const pluginRef = plugin;
			setTimeout(() => setProgrammaticRedoInProgress(false, pluginRef), 50);
		}
		pushUndo(entry);
		verbose(`[undo-redo] Redo executed. Undo stack after: ${formatStackForLog(getUndoStackSnapshot())}`);
	}
}

function executeUndo(plugin: InkPlugin, entry: UnifiedUndoEntry, activeEmbedId: string): void {
	if (entry.type === 'obsidian') {
		const editor = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		if (editor) editor.undo();
	} else if (entry.type === 'embed-resize') {
		const applier = getResizeApplier(entry.embedId);
		if (applier) applier(entry.fromWidth, entry.fromAspectRatio);
	} else {
		const tldrawEditor = getEditor(entry.embedId ?? activeEmbedId);
		if (tldrawEditor) tldrawEditor.undo();
	}
}

function executeRedo(plugin: InkPlugin, entry: UnifiedUndoEntry, activeEmbedId: string): void {
	if (entry.type === 'obsidian') {
		const editor = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		if (editor) editor.redo();
	} else if (entry.type === 'embed-resize') {
		const applier = getResizeApplier(entry.embedId);
		if (applier) applier(entry.toWidth, entry.toAspectRatio);
	} else {
		const tldrawEditor = getEditor(entry.embedId ?? activeEmbedId);
		if (tldrawEditor) tldrawEditor.redo();
	}
}

/**
 * Registers the global keydown handler for unified undo/redo.
 * Call from main.ts onload when writing or drawing is enabled.
 */
export function registerUnifiedUndoRedo(plugin: InkPlugin): void {
	plugin.registerDomEvent(document, 'keydown', (event: KeyboardEvent) => {
		handleKeydown(plugin, event);
	}, { capture: true });
}
