/**
 * Global keydown handler for unified undo/redo when an ink embed is in edit mode.
 * Captures Mod+Z and Mod+Shift+Z so the custom stack is used instead of Obsidian's.
 * State is scoped by WorkspaceLeaf.id.
 * @see docs/undo-redo-implementation.md
 */

import { Notice } from 'obsidian';
import type InkPlugin from 'src/main';
import { logToVault } from 'src/logic/utils/log-to-vault';
import { getActiveEmbedIdForLeaf, getEditor, getResizeApplier } from 'src/logic/undo-redo/ink-editor-registry';
import { getDedicatedInkEditor } from 'src/logic/undo-redo/dedicated-ink-editor-registry';
import { WRITING_VIEW_TYPE } from 'src/components/formats/current/writing/writing-view/writing-view';
import { DRAWING_VIEW_TYPE } from 'src/components/formats/current/drawing/drawing-view/drawing-view';
import {
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
	setProgrammaticUndoInProgress,
	type UnifiedUndoEntry,
} from 'src/logic/undo-redo/unified-undo-stack';
import { syncObsidianOnlyBeforeKeyboard } from 'src/logic/undo-redo/embedded-unified-undo';
import { getMarkdownViewForLeaf } from 'src/logic/undo-redo/obsidian-undo-depth';
import { verbose } from 'src/logic/utils/universal-dev-logging';

function formatStackForLog(snapshot: readonly UnifiedUndoEntry[]): string {
	return '[' + snapshot.map(e => {
		if (e.type === 'obsidian') return 'Obsidian';
		if (e.type === 'embed-resize') return `EmbedResize:${e.embedId}`;
		return `Embed:${e.embedId}`;
	}).join(', ') + ']';
}

const EMPTY_UNDO_MESSAGE =
	'To undo further in Obsidian you must lock the Ink embed (which will discard any redo ability in the embed).';

function getUnifiedUndoRedoIntent(event: KeyboardEvent): 'undo' | 'redo' | null {
	const isUnifiedModPressed = event.metaKey || event.ctrlKey;
	if (!isUnifiedModPressed) return null;
	const key = (event.key ?? '').toLowerCase();
	if (key === 'z' && !event.shiftKey) return 'undo';
	if (key === 'z' && event.shiftKey) return 'redo';
	return null;
}

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
	const leaf = plugin.app.workspace.getMostRecentLeaf();
	const viewType = leaf?.view?.getViewType?.();
	return viewType === WRITING_VIEW_TYPE || viewType === DRAWING_VIEW_TYPE;
}

function handleKeydown(plugin: InkPlugin, event: KeyboardEvent): void {
	const leafId = plugin.app.workspace.getMostRecentLeaf()?.id;
	if (!leafId) return;

	const isDedicatedLeaf = isActiveLeafDedicatedInk(plugin);
	const dedicatedEditor = getDedicatedInkEditor(leafId);

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

	const activeEmbedId = getActiveEmbedIdForLeaf(leafId);
	if (activeEmbedId === null || isDedicatedLeaf) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();

	if (intent === 'undo') {
		executeUnifiedUndo(plugin, leafId, activeEmbedId);
	} else {
		executeUnifiedRedo(plugin, leafId, activeEmbedId);
	}
}

export function executeUnifiedUndo(plugin: InkPlugin, leafId: string, activeEmbedId: string): void {
	syncObsidianOnlyBeforeKeyboard(leafId);

	if (isUndoStackEmpty(leafId)) {
		new Notice(EMPTY_UNDO_MESSAGE);
		return;
	}
	const entry = popUndo(leafId);
	if (!entry) return;
	notifyUndoExecuted(leafId, entry);
	setProgrammaticUndoInProgress(true, plugin);
	try {
		executeUndo(plugin, leafId, entry, activeEmbedId);
	} finally {
		const pluginRef = plugin;
		window.setTimeout(() => setProgrammaticUndoInProgress(false, pluginRef), 50);
	}
	pushRedo(leafId, entry);
	logToVault('Unified undo executed. Entry: ' + entry.type);
	verbose(`[undo-redo] Undo executed. Undo stack after: ${formatStackForLog(getUndoStackSnapshot(leafId))}`);
}

export function executeUnifiedRedo(plugin: InkPlugin, leafId: string, activeEmbedId: string): void {
	syncObsidianOnlyBeforeKeyboard(leafId);

	if (isRedoStackEmpty(leafId)) return;
	const entry = popRedo(leafId);
	if (!entry) return;
	notifyRedoExecuted(leafId, entry);
	setProgrammaticRedoInProgress(true, plugin);
	try {
		executeRedo(plugin, leafId, entry, activeEmbedId);
	} finally {
		const pluginRef = plugin;
		window.setTimeout(() => setProgrammaticRedoInProgress(false, pluginRef), 50);
	}
	pushUndo(leafId, entry);
	logToVault('Unified redo executed. Entry: ' + entry.type);
	verbose(`[undo-redo] Redo executed. Undo stack after: ${formatStackForLog(getUndoStackSnapshot(leafId))}`);
}

function executeUndo(plugin: InkPlugin, leafId: string, entry: UnifiedUndoEntry, activeEmbedId: string): void {
	if (entry.type === 'obsidian') {
		const md = getMarkdownViewForLeaf(plugin, leafId);
		const editor = md?.editor;
		if (editor) editor.undo();
	} else if (entry.type === 'embed-resize') {
		const applier = getResizeApplier(entry.embedId);
		if (applier) applier(entry.fromWidth, entry.fromAspectRatio);
	} else {
		const tldrawEditor = getEditor(entry.embedId ?? activeEmbedId);
		if (tldrawEditor) tldrawEditor.undo();
	}
}

function executeRedo(plugin: InkPlugin, leafId: string, entry: UnifiedUndoEntry, activeEmbedId: string): void {
	if (entry.type === 'obsidian') {
		const md = getMarkdownViewForLeaf(plugin, leafId);
		const editor = md?.editor;
		if (editor) editor.redo();
	} else if (entry.type === 'embed-resize') {
		const applier = getResizeApplier(entry.embedId);
		if (applier) applier(entry.toWidth, entry.toAspectRatio);
	} else {
		const tldrawEditor = getEditor(entry.embedId ?? activeEmbedId);
		if (tldrawEditor) tldrawEditor.redo();
	}
}

export function registerUnifiedUndoRedo(plugin: InkPlugin): void {
	plugin.registerDomEvent(activeDocument, 'keydown', (event: KeyboardEvent) => {
		handleKeydown(plugin, event);
	}, { capture: true });
}
