/**
 * Helpers for wiring ink-canvas embed editors into the unified undo/redo stack.
 * @see docs/undo-redo-implementation.md
 */

import type InkPlugin from 'src/main';
import type { AnyInkEditor } from 'src/logic/undo-redo/ink-editor-registry';
import { getRegisteredEmbedCountForLeaf, getRegisteredEmbedIdsForLeaf } from 'src/logic/undo-redo/ink-editor-registry';
import { getObsidianUndoDepthForLeaf } from 'src/logic/undo-redo/obsidian-undo-depth';
import { getTldrawNumUndos } from 'src/logic/undo-redo/tldraw-undo-depth';
import {
	initialize,
	syncUnifiedUndoHistory,
	isUndoStackEmpty,
	pushEmbedCanvasActionToUnifiedStack,
} from 'src/logic/undo-redo/unified-undo-stack';

export function initializeEmbeddedUnifiedUndo(
	plugin: InkPlugin,
	leafId: string,
	embedId: string,
	editor: AnyInkEditor,
): void {
	const obsidianDepth = getObsidianUndoDepthForLeaf(plugin, leafId);
	const canvasUndos = getTldrawNumUndos(editor);
	const registeredCount = getRegisteredEmbedCountForLeaf(leafId);
	const shouldMerge = registeredCount > 0 || !isUndoStackEmpty(leafId);

	if (shouldMerge) {
		initialize(leafId, obsidianDepth, canvasUndos, undefined, { mergeWithExisting: true, embedId });
	} else {
		initialize(leafId, obsidianDepth, canvasUndos);
	}
}

/** Called once per ink-canvas UndoManager.execute (stroke, erase, move, etc.). */
export function recordEmbedCanvasActionOnUnifiedStack(leafId: string, embedId: string): void {
	pushEmbedCanvasActionToUnifiedStack(leafId, embedId);
}

/** Pre-keyboard sync: capture markdown-only edits since the last canvas action. */
export function syncObsidianOnlyBeforeKeyboard(leafId: string): void {
	const embedIds = getRegisteredEmbedIdsForLeaf(leafId);
	if (embedIds.length === 0) return;

	syncUnifiedUndoHistory(leafId, embedIds[0], { skipEmbed: true });
}
