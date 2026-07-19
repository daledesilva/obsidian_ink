/**
 * Unit tests for unified-undo-stack.ts
 * @see docs/undo-redo-implementation.md
 */

const mockGetEditor = jest.fn();
const mockGetGlobals = jest.fn();
const mockGetObsidianUndoDepth = jest.fn();
const mockGetTldrawNumUndos = jest.fn();

jest.mock('src/logic/undo-redo/ink-editor-registry', () => ({
	getEditor: (embedId: string) => mockGetEditor(embedId),
}));

jest.mock('src/stores/global-store', () => ({
	getGlobals: () => mockGetGlobals(),
}));

jest.mock('src/logic/undo-redo/obsidian-undo-depth', () => ({
	getObsidianUndoDepthForLeaf: (_plugin: any, _leafId: string) => mockGetObsidianUndoDepth(_plugin),
}));

jest.mock('src/logic/undo-redo/tldraw-undo-depth', () => ({
	getTldrawNumUndos: (editor: any) => mockGetTldrawNumUndos(editor),
}));

import {
	initialize,
	popUndo,
	pushUndo,
	popRedo,
	pushRedo,
	isUndoStackEmpty,
	isRedoStackEmpty,
	getUndoStackSnapshot,
	syncUnifiedUndoHistory,
	pushDrawingEmbedResize,
	setProgrammaticRedoInProgress,
	setProgrammaticUndoInProgress,
	notifyUndoExecuted,
	notifyRedoExecuted,
	clearEmbedBaseline,
	purgeEmbedEntriesFromStacks,
	popEmbedUndoAndPushToRedo,
	popEmbedRedoAndPushToUndo,
	type UnifiedUndoEntry,
} from 'src/logic/undo-redo/unified-undo-stack';

const EMBED_ID = 'embed-1';
const LEAF = 'leaf-default';
const LEAF_B = 'leaf-other';
const MOCK_EDITOR = {} as any;
const MOCK_PLUGIN = {} as any;

function resetMocks() {
	mockGetEditor.mockReset();
	mockGetGlobals.mockReset();
	mockGetObsidianUndoDepth.mockReset();
	mockGetTldrawNumUndos.mockReset();
}

function setupSyncMocks(obsidianDepth: number, tldrawUndos: number) {
	mockGetEditor.mockReturnValue(MOCK_EDITOR);
	mockGetGlobals.mockReturnValue({ plugin: MOCK_PLUGIN });
	mockGetObsidianUndoDepth.mockReturnValue(obsidianDepth);
	mockGetTldrawNumUndos.mockReturnValue(tldrawUndos);
}

describe('unified-undo-stack', () => {
	beforeEach(() => {
		resetMocks();
		setProgrammaticRedoInProgress(false, MOCK_PLUGIN);
		setProgrammaticUndoInProgress(false, MOCK_PLUGIN);
		initialize(LEAF,0, 0);
	});

	describe('initialize', () => {
		it('resets stacks and baseline', () => {
			pushUndo(LEAF, { type: 'obsidian' });
			pushRedo(LEAF, { type: 'embed', embedId: EMBED_ID });
			initialize(LEAF,5, 3);

			expect(isUndoStackEmpty(LEAF)).toBe(true);
			expect(isRedoStackEmpty(LEAF)).toBe(true);
			expect(getUndoStackSnapshot(LEAF)).toEqual([]);
		});

		describe('mergeWithExisting', () => {
			const EMBED_A = 'embed-a';
			const EMBED_B = 'embed-b';

			it('preserves existing undo and redo stacks', () => {
				pushUndo(LEAF, { type: 'embed', embedId: EMBED_A });
				pushUndo(LEAF, { type: 'obsidian' });
				pushRedo(LEAF, { type: 'embed', embedId: EMBED_A });

				initialize(LEAF,2, 1, undefined, { mergeWithExisting: true, embedId: EMBED_B });

				const undoStack = getUndoStackSnapshot(LEAF);
				expect(undoStack).toHaveLength(2);
				expect(undoStack[0]).toEqual({ type: 'embed', embedId: EMBED_A });
				expect(undoStack[1]).toEqual({ type: 'obsidian' });
				expect(isRedoStackEmpty(LEAF)).toBe(false);
				expect(popRedo(LEAF)).toEqual({ type: 'embed', embedId: EMBED_A });
			});

			it('sets baseline for the new embed so sync adds entries correctly', () => {
				initialize(LEAF,0, 0);
				mockGetEditor.mockReturnValue(MOCK_EDITOR);
				setupSyncMocks(0, 1);
				syncUnifiedUndoHistory(LEAF, EMBED_A);
				expect(getUndoStackSnapshot(LEAF)).toHaveLength(1);

				initialize(LEAF,0, 2, undefined, { mergeWithExisting: true, embedId: EMBED_B });
				mockGetTldrawNumUndos.mockReturnValue(3);
				syncUnifiedUndoHistory(LEAF, EMBED_B, { maxTldrawDelta: 1 });

				const stack = getUndoStackSnapshot(LEAF);
				expect(stack).toHaveLength(2);
				expect(stack[0]).toEqual({ type: 'embed', embedId: EMBED_A });
				expect(stack[1]).toEqual({ type: 'embed', embedId: EMBED_B });
			});
		});
	});

	describe('popUndo / pushUndo / popRedo / pushRedo', () => {
		it('exhibits LIFO behavior for undo stack', () => {
			pushUndo(LEAF, { type: 'obsidian' });
			pushUndo(LEAF, { type: 'embed', embedId: EMBED_ID });

			expect(popUndo(LEAF)).toEqual({ type: 'embed', embedId: EMBED_ID });
			expect(popUndo(LEAF)).toEqual({ type: 'obsidian' });
			expect(popUndo(LEAF)).toBeNull();
		});

		it('exhibits LIFO behavior for redo stack', () => {
			pushRedo(LEAF, { type: 'embed', embedId: EMBED_ID });
			pushRedo(LEAF, { type: 'obsidian' });

			expect(popRedo(LEAF)).toEqual({ type: 'obsidian' });
			expect(popRedo(LEAF)).toEqual({ type: 'embed', embedId: EMBED_ID });
			expect(popRedo(LEAF)).toBeNull();
		});
	});

	describe('isUndoStackEmpty / isRedoStackEmpty', () => {
		it('returns true after initialize', () => {
			expect(isUndoStackEmpty(LEAF)).toBe(true);
			expect(isRedoStackEmpty(LEAF)).toBe(true);
		});

		it('returns false after pushes', () => {
			pushUndo(LEAF, { type: 'obsidian' });
			pushRedo(LEAF, { type: 'embed', embedId: EMBED_ID });

			expect(isUndoStackEmpty(LEAF)).toBe(false);
			expect(isRedoStackEmpty(LEAF)).toBe(false);
		});

		it('returns true after popping all', () => {
			pushUndo(LEAF, { type: 'obsidian' });
			popUndo(LEAF);
			expect(isUndoStackEmpty(LEAF)).toBe(true);
		});
	});

	describe('getUndoStackSnapshot', () => {
		it('returns a copy; mutations do not affect internal stack', () => {
			pushUndo(LEAF, { type: 'obsidian' });
			const snapshot = getUndoStackSnapshot(LEAF);
			(snapshot as UnifiedUndoEntry[]).push({ type: 'embed', embedId: 'x' } as UnifiedUndoEntry);

			expect(getUndoStackSnapshot(LEAF)).toHaveLength(1);
			expect(getUndoStackSnapshot(LEAF)[0]).toEqual({ type: 'obsidian' });
		});
	});

	describe('pushDrawingEmbedResize', () => {
		it('pushes entry to undo stack and clears redo stack', () => {
			pushRedo(LEAF, { type: 'obsidian' });
			pushDrawingEmbedResize(LEAF, {
				type: 'embed-resize',
				embedId: EMBED_ID,
				fromWidth: 500,
				fromAspectRatio: 16 / 9,
				toWidth: 600,
				toAspectRatio: 4 / 3,
			});

			const stack = getUndoStackSnapshot(LEAF);
			expect(stack).toHaveLength(1);
			expect(stack[0]).toEqual({
				type: 'embed-resize',
				embedId: EMBED_ID,
				fromWidth: 500,
				fromAspectRatio: 16 / 9,
				toWidth: 600,
				toAspectRatio: 4 / 3,
			});
			expect(isRedoStackEmpty(LEAF)).toBe(true);
		});
	});

	describe('notifyUndoExecuted', () => {
		it('is no-op for embed-resize entry and does not change baseline', () => {
			initialize(LEAF,0, 0);
			setupSyncMocks(0, 1);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);
			expect(getUndoStackSnapshot(LEAF)).toHaveLength(1);

			const resizeEntry = {
				type: 'embed-resize' as const,
				embedId: EMBED_ID,
				fromWidth: 500,
				fromAspectRatio: 16 / 9,
				toWidth: 600,
				toAspectRatio: 4 / 3,
			};
			notifyUndoExecuted(LEAF, resizeEntry);

			setupSyncMocks(0, 1);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);
			expect(getUndoStackSnapshot(LEAF)).toHaveLength(1);
		});

		it('decrements prevObsidianDepth for obsidian entry', () => {
			initialize(LEAF,3, 0, { [EMBED_ID]: 2 });
			notifyUndoExecuted(LEAF, { type: 'obsidian' });
			setupSyncMocks(2, 2);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);
			expect(getUndoStackSnapshot(LEAF)).toHaveLength(0);
			notifyUndoExecuted(LEAF, { type: 'obsidian' });
			notifyUndoExecuted(LEAF, { type: 'obsidian' });
			setupSyncMocks(0, 2);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);
			expect(getUndoStackSnapshot(LEAF)).toHaveLength(0);
		});

		it('decrements prevTldrawUndos for embed entry', () => {
			initialize(LEAF,0, 0);
			setupSyncMocks(0, 3);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);
			const entry = popUndo(LEAF)!;
			notifyUndoExecuted(LEAF, entry);
			setupSyncMocks(0, 3);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);
			expect(getUndoStackSnapshot(LEAF)).toHaveLength(3);
		});
	});

	describe('notifyRedoExecuted', () => {
		it('is no-op for embed-resize entry', () => {
			initialize(LEAF,0, 0);
			pushDrawingEmbedResize(LEAF, {
				type: 'embed-resize',
				embedId: EMBED_ID,
				fromWidth: 500,
				fromAspectRatio: 16 / 9,
				toWidth: 600,
				toAspectRatio: 4 / 3,
			});
			const entry = popUndo(LEAF)!;
			notifyUndoExecuted(LEAF, entry);
			pushRedo(LEAF, entry);
			notifyRedoExecuted(LEAF, entry);
			pushUndo(LEAF, entry);
			expect(getUndoStackSnapshot(LEAF)).toHaveLength(1);
		});

		it('increments prevObsidianDepth for obsidian entry', () => {
			initialize(LEAF,0, 0);
			setupSyncMocks(1, 0);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);
			const entry = popUndo(LEAF)!;
			notifyUndoExecuted(LEAF, entry);
			pushRedo(LEAF, entry);
			notifyRedoExecuted(LEAF, entry);
			pushUndo(LEAF, entry);
			setupSyncMocks(1, 0);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);
			expect(getUndoStackSnapshot(LEAF).filter((e) => e.type === 'obsidian')).toHaveLength(1);
		});

		it('increments prevTldrawUndos for embed entry', () => {
			initialize(LEAF,0, 0);
			setupSyncMocks(0, 1);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);
			const entry = popUndo(LEAF)!;
			notifyUndoExecuted(LEAF, entry);
			pushRedo(LEAF, entry);
			notifyRedoExecuted(LEAF, entry);
			pushUndo(LEAF, entry);
			setupSyncMocks(0, 1);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);
			expect(getUndoStackSnapshot(LEAF).filter((e) => e.type === 'embed')).toHaveLength(1);
		});
	});

	describe('syncUnifiedUndoHistory', () => {
		it('returns early when getEditor returns undefined', () => {
			mockGetEditor.mockReturnValue(undefined);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);
			expect(mockGetObsidianUndoDepth).not.toHaveBeenCalled();
			expect(getUndoStackSnapshot(LEAF)).toHaveLength(0);
		});

		it('adds obsidian entries when obsidianDelta > 0', () => {
			initialize(LEAF,0, 0);
			setupSyncMocks(2, 0);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);

			const stack = getUndoStackSnapshot(LEAF);
			expect(stack).toHaveLength(2);
			expect(stack[0]).toEqual({ type: 'obsidian' });
			expect(stack[1]).toEqual({ type: 'obsidian' });
		});

		it('adds embed entries when tldrawDelta > 0', () => {
			initialize(LEAF,0, 0);
			setupSyncMocks(0, 2);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);

			const stack = getUndoStackSnapshot(LEAF);
			expect(stack).toHaveLength(2);
			expect(stack[0]).toEqual({ type: 'embed', embedId: EMBED_ID });
			expect(stack[1]).toEqual({ type: 'embed', embedId: EMBED_ID });
		});

		it('adds obsidian then embed entries in correct order', () => {
			initialize(LEAF,0, 0);
			setupSyncMocks(1, 1);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);

			const stack = getUndoStackSnapshot(LEAF);
			expect(stack).toHaveLength(2);
			expect(stack[0]).toEqual({ type: 'obsidian' });
			expect(stack[1]).toEqual({ type: 'embed', embedId: EMBED_ID });
		});

		it('respects maxTldrawDelta and caps embed entries', () => {
			initialize(LEAF,0, 0);
			setupSyncMocks(0, 5);
			syncUnifiedUndoHistory(LEAF, EMBED_ID, { maxTldrawDelta: 1 });

			const stack = getUndoStackSnapshot(LEAF);
			expect(stack).toHaveLength(1);
			expect(stack[0]).toEqual({ type: 'embed', embedId: EMBED_ID });
		});

		it('clears redo stack when entries are added', () => {
			initialize(LEAF,0, 0);
			pushRedo(LEAF, { type: 'obsidian' });
			setupSyncMocks(1, 0);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);

			expect(isRedoStackEmpty(LEAF)).toBe(true);
		});

		it('updates baseline after sync', () => {
			initialize(LEAF,0, 0);
			setupSyncMocks(2, 3);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);
			expect(getUndoStackSnapshot(LEAF)).toHaveLength(5);

			setupSyncMocks(2, 3);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);
			expect(getUndoStackSnapshot(LEAF)).toHaveLength(5);
		});

		it('when programmatic redo flag is set: updates baseline, returns early, does not add entries or clear redo', () => {
			initialize(LEAF,0, 0);
			pushRedo(LEAF, { type: 'obsidian' });
			setProgrammaticRedoInProgress(true, MOCK_PLUGIN);
			mockGetGlobals.mockReturnValue({ plugin: MOCK_PLUGIN });
			setupSyncMocks(2, 3);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);

			expect(getUndoStackSnapshot(LEAF)).toHaveLength(0);
			expect(isRedoStackEmpty(LEAF)).toBe(false);
		});

		it('tracks tldraw baseline per embed when multiple embeds alternate strokes', () => {
			const EMBED_A = 'embed-a';
			const EMBED_B = 'embed-b';
			const EDITOR_A = {} as any;
			const EDITOR_B = {} as any;

			initialize(LEAF,0, 0);
			mockGetGlobals.mockReturnValue({ plugin: MOCK_PLUGIN });
			mockGetObsidianUndoDepth.mockReturnValue(0);

			mockGetEditor.mockImplementation((id: string) =>
				id === EMBED_A ? EDITOR_A : id === EMBED_B ? EDITOR_B : undefined,
			);

			mockGetTldrawNumUndos
				.mockReturnValueOnce(1)
				.mockReturnValueOnce(1)
				.mockReturnValueOnce(2)
				.mockReturnValueOnce(2);

			syncUnifiedUndoHistory(LEAF, EMBED_A);
			syncUnifiedUndoHistory(LEAF, EMBED_B);
			syncUnifiedUndoHistory(LEAF, EMBED_A);
			syncUnifiedUndoHistory(LEAF, EMBED_B);

			const stack = getUndoStackSnapshot(LEAF);
			expect(stack).toHaveLength(4);
			expect(stack[0]).toEqual({ type: 'embed', embedId: EMBED_A });
			expect(stack[1]).toEqual({ type: 'embed', embedId: EMBED_B });
			expect(stack[2]).toEqual({ type: 'embed', embedId: EMBED_A });
			expect(stack[3]).toEqual({ type: 'embed', embedId: EMBED_B });
		});
	});

	describe('clearEmbedBaseline', () => {
		it('removes embed baseline so next sync uses fresh baseline', () => {
			initialize(LEAF,0, 0);
			setupSyncMocks(0, 2);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);
			expect(getUndoStackSnapshot(LEAF)).toHaveLength(2);

			clearEmbedBaseline(LEAF, EMBED_ID);
			setupSyncMocks(0, 1);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);
			expect(getUndoStackSnapshot(LEAF)).toHaveLength(3);
		});
	});

	describe('purgeEmbedEntriesFromStacks', () => {
		const EMBED_A = 'embed-a';
		const EMBED_B = 'embed-b';

		it('removes embed entries from undo stack, leaves others', () => {
			pushUndo(LEAF, { type: 'embed', embedId: EMBED_B });
			pushUndo(LEAF, { type: 'embed', embedId: EMBED_A });
			pushUndo(LEAF, { type: 'embed', embedId: EMBED_B });
			pushUndo(LEAF, { type: 'embed', embedId: EMBED_A });

			purgeEmbedEntriesFromStacks(LEAF, EMBED_A);

			const stack = getUndoStackSnapshot(LEAF);
			expect(stack).toHaveLength(2);
			expect(stack[0]).toEqual({ type: 'embed', embedId: EMBED_B });
			expect(stack[1]).toEqual({ type: 'embed', embedId: EMBED_B });
		});

		it('removes embed entries from redo stack, leaves others', () => {
			pushUndo(LEAF, { type: 'embed', embedId: EMBED_A });
			popUndo(LEAF);
			pushRedo(LEAF, { type: 'embed', embedId: EMBED_A });
			pushRedo(LEAF, { type: 'embed', embedId: EMBED_B });
			pushRedo(LEAF, { type: 'embed', embedId: EMBED_A });

			purgeEmbedEntriesFromStacks(LEAF, EMBED_A);

			expect(popRedo(LEAF)).toEqual({ type: 'embed', embedId: EMBED_B });
			expect(popRedo(LEAF)).toBeNull();
		});

		it('leaves obsidian entries untouched', () => {
			pushUndo(LEAF, { type: 'obsidian' });
			pushUndo(LEAF, { type: 'embed', embedId: EMBED_A });
			pushUndo(LEAF, { type: 'obsidian' });

			purgeEmbedEntriesFromStacks(LEAF, EMBED_A);

			const stack = getUndoStackSnapshot(LEAF);
			expect(stack).toHaveLength(2);
			expect(stack[0]).toEqual({ type: 'obsidian' });
			expect(stack[1]).toEqual({ type: 'obsidian' });
		});

		it('preserves relative order of remaining entries', () => {
			pushUndo(LEAF, { type: 'embed', embedId: EMBED_B });
			pushUndo(LEAF, { type: 'embed', embedId: EMBED_A });
			pushUndo(LEAF, { type: 'obsidian' });
			pushUndo(LEAF, { type: 'embed', embedId: EMBED_A });
			pushUndo(LEAF, { type: 'embed', embedId: EMBED_B });

			purgeEmbedEntriesFromStacks(LEAF, EMBED_A);

			const stack = getUndoStackSnapshot(LEAF);
			expect(stack).toHaveLength(3);
			expect(stack[0]).toEqual({ type: 'embed', embedId: EMBED_B });
			expect(stack[1]).toEqual({ type: 'obsidian' });
			expect(stack[2]).toEqual({ type: 'embed', embedId: EMBED_B });
		});

		it('no-op when embed has no entries', () => {
			pushUndo(LEAF, { type: 'embed', embedId: EMBED_B });
			pushUndo(LEAF, { type: 'obsidian' });

			purgeEmbedEntriesFromStacks(LEAF, EMBED_A);

			const stack = getUndoStackSnapshot(LEAF);
			expect(stack).toHaveLength(2);
			expect(stack[0]).toEqual({ type: 'embed', embedId: EMBED_B });
			expect(stack[1]).toEqual({ type: 'obsidian' });
		});

		it('removes embed-resize entries from undo and redo stacks', () => {
			const resizeEntry = {
				type: 'embed-resize' as const,
				embedId: EMBED_A,
				fromWidth: 500,
				fromAspectRatio: 16 / 9,
				toWidth: 600,
				toAspectRatio: 4 / 3,
			};
			pushUndo(LEAF, { type: 'embed', embedId: EMBED_B });
			pushUndo(LEAF, resizeEntry);
			pushUndo(LEAF, { type: 'embed', embedId: EMBED_A });

			purgeEmbedEntriesFromStacks(LEAF, EMBED_A);

			const stack = getUndoStackSnapshot(LEAF);
			expect(stack).toHaveLength(1);
			expect(stack[0]).toEqual({ type: 'embed', embedId: EMBED_B });
		});
	});

	describe('programmatic redo guard', () => {
		it('stores flag on plugin instance', () => {
			const plugin = {} as any;
			setProgrammaticRedoInProgress(true, plugin);
			expect((plugin as any).__inkProgrammaticRedoInProgress).toBe(true);

			setProgrammaticRedoInProgress(false, plugin);
			expect((plugin as any).__inkProgrammaticRedoInProgress).toBe(false);
		});

		it('with flag set, sync skips add/clear but updates baseline', () => {
			initialize(LEAF,0, 0);
			const plugin = {} as any;
			setProgrammaticRedoInProgress(true, plugin);
			mockGetGlobals.mockReturnValue({ plugin });
			mockGetEditor.mockReturnValue(MOCK_EDITOR);
			mockGetObsidianUndoDepth.mockReturnValue(2);
			mockGetTldrawNumUndos.mockReturnValue(2);

			syncUnifiedUndoHistory(LEAF, EMBED_ID);

			expect(getUndoStackSnapshot(LEAF)).toHaveLength(0);
			setProgrammaticRedoInProgress(false, plugin);
			mockGetObsidianUndoDepth.mockReturnValue(2);
			mockGetTldrawNumUndos.mockReturnValue(2);
			syncUnifiedUndoHistory(LEAF, EMBED_ID);
			expect(getUndoStackSnapshot(LEAF)).toHaveLength(0);
		});
	});

	describe('popEmbedUndoAndPushToRedo', () => {
		it('moves topmost embed entry from undo to redo and updates baseline', () => {
			pushUndo(LEAF, { type: 'obsidian' });
			pushUndo(LEAF, { type: 'embed', embedId: EMBED_ID });
			pushUndo(LEAF, { type: 'embed', embedId: 'embed-2' });

			const entry = popEmbedUndoAndPushToRedo(LEAF, EMBED_ID);

			expect(entry).toEqual({ type: 'embed', embedId: EMBED_ID });
			const undoStackSnapshot = getUndoStackSnapshot(LEAF);
			expect(undoStackSnapshot).toHaveLength(2);
			expect(undoStackSnapshot[0]).toEqual({ type: 'obsidian' });
			expect(undoStackSnapshot[1]).toEqual({ type: 'embed', embedId: 'embed-2' });
			expect(popRedo(LEAF)).toEqual({ type: 'embed', embedId: EMBED_ID });
		});

		it('returns null when no embed entry for this embed in undo stack', () => {
			pushUndo(LEAF, { type: 'obsidian' });
			pushUndo(LEAF, { type: 'embed', embedId: 'embed-2' });

			const entry = popEmbedUndoAndPushToRedo(LEAF, EMBED_ID);

			expect(entry).toBeNull();
			expect(getUndoStackSnapshot(LEAF)).toHaveLength(2);
		});
	});

	describe('popEmbedRedoAndPushToUndo', () => {
		it('moves topmost embed entry from redo to undo and updates baseline', () => {
			pushUndo(LEAF, { type: 'embed', embedId: EMBED_ID });
			popUndo(LEAF);
			pushRedo(LEAF, { type: 'embed', embedId: 'embed-2' });
			pushRedo(LEAF, { type: 'embed', embedId: EMBED_ID });

			const entry = popEmbedRedoAndPushToUndo(LEAF, EMBED_ID);

			expect(entry).toEqual({ type: 'embed', embedId: EMBED_ID });
			expect(popRedo(LEAF)).toEqual({ type: 'embed', embedId: 'embed-2' });
			expect(popUndo(LEAF)).toEqual({ type: 'embed', embedId: EMBED_ID });
		});

		it('returns null when no embed entry for this embed in redo stack', () => {
			pushRedo(LEAF, { type: 'embed', embedId: 'embed-2' });

			const entry = popEmbedRedoAndPushToUndo(LEAF, EMBED_ID);

			expect(entry).toBeNull();
			expect(popRedo(LEAF)).toEqual({ type: 'embed', embedId: 'embed-2' });
		});
	});

	describe('per-leaf isolation', () => {
		it('keeps undo stacks separate for different WorkspaceLeaf ids', () => {
			initialize(LEAF, 0, 0);
			initialize(LEAF_B, 0, 0);
			pushUndo(LEAF, { type: 'obsidian' });
			pushUndo(LEAF_B, { type: 'embed', embedId: EMBED_ID });
			expect(getUndoStackSnapshot(LEAF)).toHaveLength(1);
			expect(getUndoStackSnapshot(LEAF_B)).toHaveLength(1);
			expect(popUndo(LEAF)).toEqual({ type: 'obsidian' });
			expect(popUndo(LEAF_B)).toEqual({ type: 'embed', embedId: EMBED_ID });
		});
	});
});
