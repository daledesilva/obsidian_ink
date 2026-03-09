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
const prevTldrawUndosByEmbed = new Map<string, number>();

const PLUGIN_FLAG_KEY = '__inkProgrammaticRedoInProgress';

/** When true, sync skips adding entries and clearing redo (store.listen fires during our programmatic redo). Stored on plugin instance so it survives multiple module instances. */
export function setProgrammaticRedoInProgress(value: boolean, plugin?: any): void {
	const target = plugin ?? (() => { try { return getGlobals().plugin; } catch { return null; } })();
	if (target) (target as any)[PLUGIN_FLAG_KEY] = value;
}

function isProgrammaticRedoInProgress(): boolean {
	try {
		const plugin = getGlobals().plugin as any;
		return !!plugin?.[PLUGIN_FLAG_KEY];
	} catch {
		return false;
	}
}

function formatEntry(entry: UnifiedUndoEntry): string {
	return entry.type === 'obsidian' ? 'Obsidian' : `Embed:${entry.embedId}`;
}

function formatStackForLog(stack: UnifiedUndoEntry[]): string {
	return '[' + stack.map(formatEntry).join(', ') + ']';
}

export interface InitializeOptions {
	mergeWithExisting: true;
	embedId: string;
}

export function initialize(
	obsidianDepth: number,
	tldrawUndos?: number,
	seedTldrawByEmbed?: Record<string, number>,
	options?: InitializeOptions,
): void {
	prevObsidianDepth = obsidianDepth;

	if (options?.mergeWithExisting && options.embedId) {
		prevTldrawUndosByEmbed.set(options.embedId, tldrawUndos ?? 0);
		return;
	}

	if (seedTldrawByEmbed) {
		prevTldrawUndosByEmbed.clear();
		for (const [id, count] of Object.entries(seedTldrawByEmbed)) {
			prevTldrawUndosByEmbed.set(id, count);
		}
	} else {
		prevTldrawUndosByEmbed.clear();
	}
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

	const prevTldrawUndos = prevTldrawUndosByEmbed.get(embedId) ?? 0;
	const obsidianDelta = Math.max(0, obsidianDepth - prevObsidianDepth);
	let tldrawDelta = Math.max(0, tldrawUndos - prevTldrawUndos);
	if (options?.maxTldrawDelta !== undefined) {
		tldrawDelta = Math.min(tldrawDelta, options.maxTldrawDelta);
	}

	if (isProgrammaticRedoInProgress()) {
		prevObsidianDepth = obsidianDepth;
		prevTldrawUndosByEmbed.set(embedId, tldrawUndos);
		return;
	}

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
	prevTldrawUndosByEmbed.set(embedId, tldrawUndos);
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
		const current = prevTldrawUndosByEmbed.get(entry.embedId) ?? 0;
		prevTldrawUndosByEmbed.set(entry.embedId, Math.max(0, current - 1));
	}
}

/**
 * Call after executing a redo so prev baseline stays in sync.
 */
export function notifyRedoExecuted(entry: UnifiedUndoEntry): void {
	if (entry.type === 'obsidian') {
		prevObsidianDepth += 1;
	} else {
		const current = prevTldrawUndosByEmbed.get(entry.embedId) ?? 0;
		prevTldrawUndosByEmbed.set(entry.embedId, current + 1);
	}
}

/**
 * Remove baseline for an embed when it is unregistered (e.g. on lock).
 * Prevents unbounded growth of the per-embed baseline map.
 */
export function clearEmbedBaseline(embedId: string): void {
	prevTldrawUndosByEmbed.delete(embedId);
}

/**
 * Remove all entries for a given embed from undo and redo stacks.
 * Call when an embed is locked (unregistered). Preserves relative order of remaining entries.
 */
export function purgeEmbedEntriesFromStacks(embedId: string): void {
	undoStack = undoStack.filter((e) => !(e.type === 'embed' && e.embedId === embedId));
	redoStack = redoStack.filter((e) => !(e.type === 'embed' && e.embedId === embedId));
}
