/**
 * Unified undo/redo stack for ink embeds.
 * Interleaves tldraw (canvas) and Obsidian (markdown) actions.
 * @see docs/undo-redo.md
 * @see docs/undo-redo-implementation.md
 */

import { verbose } from 'src/logic/utils/log-to-console';
import { getGlobals } from 'src/stores/global-store';
import { getEditor } from 'src/logic/undo-redo/ink-editor-registry';
import { getObsidianUndoDepth } from 'src/logic/undo-redo/obsidian-undo-depth';
import { getTldrawNumUndos } from 'src/logic/undo-redo/tldraw-undo-depth';

export type UnifiedUndoEntry =
	| { type: 'embed'; embedId: string }
	| { type: 'obsidian' };

let undoStack: UnifiedUndoEntry[] = [];
let redoStack: UnifiedUndoEntry[] = [];
let prevObsidianDepth = 0;
let prevTldrawUndos = 0;

function formatEntry(entry: UnifiedUndoEntry): string {
	return entry.type === 'obsidian' ? 'Obsidian' : `Embed:${entry.embedId}`;
}

function formatStackForLog(stack: UnifiedUndoEntry[]): string {
	return '[' + stack.map(formatEntry).join(', ') + ']';
}

export function initialize(obsidianDepth: number, tldrawUndos: number): void {
	prevObsidianDepth = obsidianDepth;
	prevTldrawUndos = tldrawUndos;
	undoStack = [];
	redoStack = [];
}

/**
 * Syncs the unified undo history from Obsidian and tldraw depths.
 * Adds any Obsidian and tldraw actions since last sync, in correct order.
 * Clears the redo stack.
 * @param options.maxTldrawDelta - When set, caps embed entries added per sync (e.g. 1 per stroke for DrawingCompleted).
 */
export function syncUnifiedUndoHistory(
	embedId: string,
	options?: { maxTldrawDelta?: number },
): void {
	const editor = getEditor(embedId);
	if (!editor) return;

	const plugin = getGlobals().plugin;
	const obsidianDepth = getObsidianUndoDepth(plugin);
	const tldrawUndos = getTldrawNumUndos(editor);

	const obsidianDelta = Math.max(0, obsidianDepth - prevObsidianDepth);
	let tldrawDelta = Math.max(0, tldrawUndos - prevTldrawUndos);
	if (options?.maxTldrawDelta !== undefined) {
		tldrawDelta = Math.min(tldrawDelta, options.maxTldrawDelta);
	}

	console.log('Obsidian delta', obsidianDelta);
	console.log('Tldraw delta', tldrawDelta);
	const added: string[] = [];
	for (let i = 0; i < obsidianDelta; i++) {
		undoStack.push({ type: 'obsidian' });
		added.push('Obsidian');
	}
	for (let i = 0; i < tldrawDelta; i++) {
		undoStack.push({ type: 'embed', embedId });
		added.push(`Embed:${embedId}`);
	}

	if (added.length > 0) {
		verbose(`[undo-redo] Undo stack before: ${formatStackForLog(undoStack.slice(0, -added.length))}`);
		verbose(`[undo-redo] Undo stack after: ${formatStackForLog([...undoStack])}`);
		redoStack = [];
	}

	prevObsidianDepth = obsidianDepth;
	prevTldrawUndos = tldrawUndos;
}

export function getUndoStackSnapshot(): readonly UnifiedUndoEntry[] {
	return [...undoStack];
}

export function popUndo(): UnifiedUndoEntry | null {
	return undoStack.pop() ?? null;
}

export function pushRedo(entry: UnifiedUndoEntry): void {
	redoStack.push(entry);
}

export function popRedo(): UnifiedUndoEntry | null {
	return redoStack.pop() ?? null;
}

export function pushUndo(entry: UnifiedUndoEntry): void {
	undoStack.push(entry);
}

export function isUndoStackEmpty(): boolean {
	return undoStack.length === 0;
}

export function isRedoStackEmpty(): boolean {
	return redoStack.length === 0;
}

/**
 * Call after executing an undo or redo so prev baseline stays in sync with
 * the underlying editors. Prevents double-counting on the next sync.
 */
export function notifyUndoExecuted(entry: UnifiedUndoEntry): void {
	if (entry.type === 'obsidian') {
		prevObsidianDepth = Math.max(0, prevObsidianDepth - 1);
	} else {
		prevTldrawUndos = Math.max(0, prevTldrawUndos - 1);
	}
}

/**
 * Call after executing a redo so prev baseline stays in sync.
 */
export function notifyRedoExecuted(entry: UnifiedUndoEntry): void {
	if (entry.type === 'obsidian') {
		prevObsidianDepth += 1;
	} else {
		prevTldrawUndos += 1;
	}
}
