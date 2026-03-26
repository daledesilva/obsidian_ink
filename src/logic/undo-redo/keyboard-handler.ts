/**
 * Global keydown handler for unified undo/redo when an ink embed is in edit mode.
 * Captures Mod+Z and Mod+Shift+Z so the custom stack is used instead of Obsidian's.
 * @see docs/undo-redo-implementation.md
 */

import { MarkdownView, Notice } from 'obsidian';
import type InkPlugin from 'src/main';
import { getActiveEmbedId, getEditor, getResizeApplier } from 'src/logic/undo-redo/ink-editor-registry';
import { getDedicatedInkEditor } from 'src/logic/undo-redo/dedicated-ink-editor-registry';
import { WRITING_VIEW_TYPE } from 'src/components/formats/current/writing/writing-view/writing-view';
import { DRAWING_VIEW_TYPE } from 'src/components/formats/current/drawing/drawing-view/drawing-view';
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

type UnifiedUndoRedoIntent = 'undo' | 'redo';

function getUnifiedUndoRedoIntent(event: KeyboardEvent): 'undo' | 'redo' | null {
	const isUnifiedModPressed = event.metaKey || event.ctrlKey;
	if (!isUnifiedModPressed) return null;

	// Just incase z comes in as captial because of shift or capslock
	const key = (event.key ?? '').toLowerCase();

	// Undo: Mod+Z (no shift)
	if (key === 'z' && !event.shiftKey) return 'undo';

	// Redo: Mod+Shift+Z
	if (key === 'z' && event.shiftKey) return 'redo';

	return null;
}

/** Matches dedicated ink editor shortcuts (includes Mod+Y redo). */
function getDedicatedUndoRedoIntent(event: KeyboardEvent): 'undo' | 'redo' | null {
	const isUnifiedModPressed = event.metaKey || event.ctrlKey;
	if (!isUnifiedModPressed) return null;
	const key = (event.key ?? '').toLowerCase();
	if (key === 'z' && !event.shiftKey) return 'undo';
	if (key === 'z' && event.shiftKey) return 'redo';
	if (key === 'y') return 'redo';
	return null;
}

function isActiveLeafDedicatedInk(plugin: InkPlugin): boolean {
	const viewType = plugin.app.workspace.activeLeaf?.view?.getViewType?.();
	return viewType === WRITING_VIEW_TYPE || viewType === DRAWING_VIEW_TYPE;
}

function handleKeydown(plugin: InkPlugin, event: KeyboardEvent): void {
	const isDedicatedLeaf = isActiveLeafDedicatedInk(plugin);
	const dedicatedEditor = getDedicatedInkEditor();

	// Dedicated ink view: keydown target is often BODY; wrapper never sees Mod+Z.
	if (isDedicatedLeaf && dedicatedEditor !== null) {
		const dedicatedIntent = getDedicatedUndoRedoIntent(event);
		if (dedicatedIntent !== null) {
			event.preventDefault();
			event.stopPropagation();
			if (dedicatedIntent === 'undo') {
				dedicatedEditor.undo();
			} else {
				dedicatedEditor.redo();
			}
			return;
		}
	}

	const intent = getUnifiedUndoRedoIntent(event);
	if (intent === null) return;

	const activeEmbedId = getActiveEmbedId();
	// Avoid embed unified stack while a dedicated ink leaf is active (stale embed id from another tab).
	if (activeEmbedId === null || isDedicatedLeaf) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();

	if (intent === 'undo') {
		executeUnifiedUndo(plugin, activeEmbedId);
	} else {
		executeUnifiedRedo(plugin, activeEmbedId);
	}
}

export function executeUnifiedUndo(plugin: InkPlugin, activeEmbedId: string): void {
	syncUnifiedUndoHistory(activeEmbedId);

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
}

export function executeUnifiedRedo(plugin: InkPlugin, activeEmbedId: string): void {
	syncUnifiedUndoHistory(activeEmbedId);

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
