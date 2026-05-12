/**
 * Unified undo/redo stack for ink embeds, scoped per WorkspaceLeaf.id.
 * Interleaves tldraw (canvas) and Obsidian (markdown) actions within one leaf.
 * @see docs/undo-redo-implementation.md
 */

import { verbose } from 'src/logic/utils/universal-dev-logging';
import { getGlobals } from 'src/stores/global-store';
import { getEditor } from 'src/logic/undo-redo/ink-editor-registry';
import { getObsidianUndoDepthForLeaf } from 'src/logic/undo-redo/obsidian-undo-depth';
import { getTldrawNumUndos } from 'src/logic/undo-redo/tldraw-undo-depth';

export type UnifiedUndoEntry =
	| { type: 'embed'; embedId: string }
	| { type: 'embed-resize'; embedId: string; fromWidth: number; fromAspectRatio: number; toWidth: number; toAspectRatio: number }
	| { type: 'obsidian' };

interface LeafUndoState {
	undoStack: UnifiedUndoEntry[];
	redoStack: UnifiedUndoEntry[];
	prevObsidianDepth: number;
	prevTldrawUndosByEmbed: Map<string, number>;
}

const leafStates = new Map<string, LeafUndoState>();

function getLeafState(leafId: string): LeafUndoState {
	let s = leafStates.get(leafId);
	if (!s) {
		s = {
			undoStack: [],
			redoStack: [],
			prevObsidianDepth: 0,
			prevTldrawUndosByEmbed: new Map(),
		};
		leafStates.set(leafId, s);
	}
	return s;
}

const PLUGIN_FLAG_KEY_REDO = '__inkProgrammaticRedoInProgress';
const PLUGIN_FLAG_KEY_UNDO = '__inkProgrammaticUndoInProgress';

export function setProgrammaticRedoInProgress(value: boolean, plugin?: any): void {
	const target = plugin ?? (() => { try { return getGlobals().plugin; } catch { return null; } })();
	if (target) (target as any)[PLUGIN_FLAG_KEY_REDO] = value;
}

export function setProgrammaticUndoInProgress(value: boolean, plugin?: any): void {
	const target = plugin ?? (() => { try { return getGlobals().plugin; } catch { return null; } })();
	if (target) (target as any)[PLUGIN_FLAG_KEY_UNDO] = value;
}

function isProgrammaticRedoInProgress(): boolean {
	try {
		const plugin = getGlobals().plugin as any;
		return !!plugin?.[PLUGIN_FLAG_KEY_REDO];
	} catch {
		return false;
	}
}

function isProgrammaticUndoInProgress(): boolean {
	try {
		const plugin = getGlobals().plugin as any;
		return !!plugin?.[PLUGIN_FLAG_KEY_UNDO];
	} catch {
		return false;
	}
}

function formatEntry(entry: UnifiedUndoEntry): string {
	if (entry.type === 'obsidian') return 'Obsidian';
	if (entry.type === 'embed-resize') return `EmbedResize:${entry.embedId}`;
	return `Embed:${entry.embedId}`;
}

function formatStackForLog(stack: UnifiedUndoEntry[]): string {
	return '[' + stack.map(formatEntry).join(', ') + ']';
}

export interface InitializeOptions {
	mergeWithExisting: true;
	embedId: string;
}

export function initialize(
	leafId: string,
	obsidianDepth: number,
	tldrawUndos?: number,
	seedTldrawByEmbed?: Record<string, number>,
	options?: InitializeOptions,
): void {
	const s = getLeafState(leafId);
	s.prevObsidianDepth = obsidianDepth;

	if (options?.mergeWithExisting && options.embedId) {
		s.prevTldrawUndosByEmbed.set(options.embedId, tldrawUndos ?? 0);
		return;
	}

	if (seedTldrawByEmbed) {
		s.prevTldrawUndosByEmbed.clear();
		for (const [id, count] of Object.entries(seedTldrawByEmbed)) {
			s.prevTldrawUndosByEmbed.set(id, count);
		}
	} else {
		s.prevTldrawUndosByEmbed.clear();
	}
	s.undoStack = [];
	s.redoStack = [];
}

export function syncUnifiedUndoHistory(
	leafId: string,
	embedId: string,
	options?: { maxTldrawDelta?: number },
): void {
	const editor = getEditor(embedId);
	if (!editor) return;

	const s = getLeafState(leafId);
	const plugin = getGlobals().plugin;
	const obsidianDepth = getObsidianUndoDepthForLeaf(plugin, leafId);
	const tldrawUndos = getTldrawNumUndos(editor);

	const prevTldrawUndos = s.prevTldrawUndosByEmbed.get(embedId) ?? 0;
	const obsidianDelta = Math.max(0, obsidianDepth - s.prevObsidianDepth);
	let tldrawDelta = Math.max(0, tldrawUndos - prevTldrawUndos);
	if (options?.maxTldrawDelta !== undefined) {
		tldrawDelta = Math.min(tldrawDelta, options.maxTldrawDelta);
	}

	if (isProgrammaticRedoInProgress()) {
		s.prevObsidianDepth = obsidianDepth;
		s.prevTldrawUndosByEmbed.set(embedId, tldrawUndos);
		return;
	}
	if (isProgrammaticUndoInProgress()) {
		return;
	}

	const added: string[] = [];
	for (let i = 0; i < obsidianDelta; i++) {
		s.undoStack.push({ type: 'obsidian' });
		added.push('Obsidian');
	}
	for (let i = 0; i < tldrawDelta; i++) {
		s.undoStack.push({ type: 'embed', embedId });
		added.push(`Embed:${embedId}`);
	}

	if (added.length > 0) {
		verbose(`[undo-redo] Undo stack before: ${formatStackForLog(s.undoStack.slice(0, -added.length))}`);
		verbose(`[undo-redo] Undo stack after: ${formatStackForLog([...s.undoStack])}`);
		s.redoStack = [];
	}

	s.prevObsidianDepth = obsidianDepth;
	s.prevTldrawUndosByEmbed.set(embedId, tldrawUndos);
}

export function pushDrawingEmbedResize(
	leafId: string,
	entry: Extract<UnifiedUndoEntry, { type: 'embed-resize' }>,
): void {
	const s = getLeafState(leafId);
	s.undoStack.push(entry);
	s.redoStack = [];
	verbose(`[undo-redo] Pushed embed-resize. Undo stack after: ${formatStackForLog([...s.undoStack])}`);
}

export function getUndoStackSnapshot(leafId: string): readonly UnifiedUndoEntry[] {
	return [...getLeafState(leafId).undoStack];
}

export function popUndo(leafId: string): UnifiedUndoEntry | null {
	return getLeafState(leafId).undoStack.pop() ?? null;
}

export function pushRedo(leafId: string, entry: UnifiedUndoEntry): void {
	getLeafState(leafId).redoStack.push(entry);
}

export function popRedo(leafId: string): UnifiedUndoEntry | null {
	return getLeafState(leafId).redoStack.pop() ?? null;
}

export function pushUndo(leafId: string, entry: UnifiedUndoEntry): void {
	getLeafState(leafId).undoStack.push(entry);
}

export function isUndoStackEmpty(leafId: string): boolean {
	return getLeafState(leafId).undoStack.length === 0;
}

export function isRedoStackEmpty(leafId: string): boolean {
	return getLeafState(leafId).redoStack.length === 0;
}

export function notifyUndoExecuted(leafId: string, entry: UnifiedUndoEntry): void {
	const s = getLeafState(leafId);
	if (entry.type === 'obsidian') {
		s.prevObsidianDepth = Math.max(0, s.prevObsidianDepth - 1);
	} else if (entry.type === 'embed-resize') {
		// No baseline to adjust for resize entries.
	} else {
		const current = s.prevTldrawUndosByEmbed.get(entry.embedId) ?? 0;
		s.prevTldrawUndosByEmbed.set(entry.embedId, Math.max(0, current - 1));
	}
}

export function notifyRedoExecuted(leafId: string, entry: UnifiedUndoEntry): void {
	const s = getLeafState(leafId);
	if (entry.type === 'obsidian') {
		s.prevObsidianDepth += 1;
	} else if (entry.type === 'embed-resize') {
		// No baseline to adjust for resize entries.
	} else {
		const current = s.prevTldrawUndosByEmbed.get(entry.embedId) ?? 0;
		s.prevTldrawUndosByEmbed.set(entry.embedId, current + 1);
	}
}

export function clearEmbedBaseline(leafId: string, embedId: string): void {
	getLeafState(leafId).prevTldrawUndosByEmbed.delete(embedId);
}

export function purgeEmbedEntriesFromStacks(leafId: string, embedId: string): void {
	const s = getLeafState(leafId);
	const matchesEmbed = (e: UnifiedUndoEntry) =>
		(e.type === 'embed' && e.embedId === embedId) || (e.type === 'embed-resize' && e.embedId === embedId);
	s.undoStack = s.undoStack.filter((e) => !matchesEmbed(e));
	s.redoStack = s.redoStack.filter((e) => !matchesEmbed(e));
}

function findTopmostEmbedIndex(stack: UnifiedUndoEntry[], embedId: string): number {
	return stack.findIndex((e) => e.type === 'embed' && e.embedId === embedId);
}

export function popEmbedUndoAndPushToRedo(leafId: string, embedId: string): UnifiedUndoEntry | null {
	const s = getLeafState(leafId);
	const index = findTopmostEmbedIndex(s.undoStack, embedId);
	if (index < 0) return null;
	const entry = s.undoStack.splice(index, 1)[0] as Extract<UnifiedUndoEntry, { type: 'embed' }>;
	notifyUndoExecuted(leafId, entry);
	s.redoStack.push(entry);
	verbose(`[undo-redo] Local embed undo: moved ${formatEntry(entry)} to redo. Undo stack after: ${formatStackForLog([...s.undoStack])}`);
	return entry;
}

export function popEmbedRedoAndPushToUndo(leafId: string, embedId: string): UnifiedUndoEntry | null {
	const s = getLeafState(leafId);
	const index = findTopmostEmbedIndex(s.redoStack, embedId);
	if (index < 0) return null;
	const entry = s.redoStack.splice(index, 1)[0] as Extract<UnifiedUndoEntry, { type: 'embed' }>;
	notifyRedoExecuted(leafId, entry);
	s.undoStack.push(entry);
	verbose(`[undo-redo] Local embed redo: moved ${formatEntry(entry)} to undo. Undo stack after: ${formatStackForLog([...s.undoStack])}`);
	return entry;
}
