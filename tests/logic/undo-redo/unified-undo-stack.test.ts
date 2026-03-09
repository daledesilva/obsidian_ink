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
	getObsidianUndoDepth: (plugin: any) => mockGetObsidianUndoDepth(plugin),
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
	setProgrammaticRedoInProgress,
	notifyUndoExecuted,
	notifyRedoExecuted,
	clearEmbedBaseline,
	purgeEmbedEntriesFromStacks,
	type UnifiedUndoEntry,
} from 'src/logic/undo-redo/unified-undo-stack';

const EMBED_ID = 'embed-1';
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
		initialize(0, 0);
	});

	describe('initialize', () => {
		it('resets stacks and baseline', () => {
			pushUndo({ type: 'obsidian' });
			pushRedo({ type: 'embed', embedId: EMBED_ID });
			initialize(5, 3);

			expect(isUndoStackEmpty()).toBe(true);
			expect(isRedoStackEmpty()).toBe(true);
			expect(getUndoStackSnapshot()).toEqual([]);
		});

		describe('mergeWithExisting', () => {
			const EMBED_A = 'embed-a';
			const EMBED_B = 'embed-b';

			it('preserves existing undo and redo stacks', () => {
				pushUndo({ type: 'embed', embedId: EMBED_A });
				pushUndo({ type: 'obsidian' });
				pushRedo({ type: 'embed', embedId: EMBED_A });

				initialize(2, 1, undefined, { mergeWithExisting: true, embedId: EMBED_B });

				const undoStack = getUndoStackSnapshot();
				expect(undoStack).toHaveLength(2);
				expect(undoStack[0]).toEqual({ type: 'embed', embedId: EMBED_A });
				expect(undoStack[1]).toEqual({ type: 'obsidian' });
				expect(isRedoStackEmpty()).toBe(false);
				expect(popRedo()).toEqual({ type: 'embed', embedId: EMBED_A });
			});

			it('sets baseline for the new embed so sync adds entries correctly', () => {
				initialize(0, 0);
				mockGetEditor.mockReturnValue(MOCK_EDITOR);
				setupSyncMocks(0, 1);
				syncUnifiedUndoHistory(EMBED_A);
				expect(getUndoStackSnapshot()).toHaveLength(1);

				initialize(0, 2, undefined, { mergeWithExisting: true, embedId: EMBED_B });
				mockGetTldrawNumUndos.mockReturnValue(3);
				syncUnifiedUndoHistory(EMBED_B, { maxTldrawDelta: 1 });

				const stack = getUndoStackSnapshot();
				expect(stack).toHaveLength(2);
				expect(stack[0]).toEqual({ type: 'embed', embedId: EMBED_A });
				expect(stack[1]).toEqual({ type: 'embed', embedId: EMBED_B });
			});
		});
	});

	describe('popUndo / pushUndo / popRedo / pushRedo', () => {
		it('exhibits LIFO behavior for undo stack', () => {
			pushUndo({ type: 'obsidian' });
			pushUndo({ type: 'embed', embedId: EMBED_ID });

			expect(popUndo()).toEqual({ type: 'embed', embedId: EMBED_ID });
			expect(popUndo()).toEqual({ type: 'obsidian' });
			expect(popUndo()).toBeNull();
		});

		it('exhibits LIFO behavior for redo stack', () => {
			pushRedo({ type: 'embed', embedId: EMBED_ID });
			pushRedo({ type: 'obsidian' });

			expect(popRedo()).toEqual({ type: 'obsidian' });
			expect(popRedo()).toEqual({ type: 'embed', embedId: EMBED_ID });
			expect(popRedo()).toBeNull();
		});
	});

	describe('isUndoStackEmpty / isRedoStackEmpty', () => {
		it('returns true after initialize', () => {
			expect(isUndoStackEmpty()).toBe(true);
			expect(isRedoStackEmpty()).toBe(true);
		});

		it('returns false after pushes', () => {
			pushUndo({ type: 'obsidian' });
			pushRedo({ type: 'embed', embedId: EMBED_ID });

			expect(isUndoStackEmpty()).toBe(false);
			expect(isRedoStackEmpty()).toBe(false);
		});

		it('returns true after popping all', () => {
			pushUndo({ type: 'obsidian' });
			popUndo();
			expect(isUndoStackEmpty()).toBe(true);
		});
	});

	describe('getUndoStackSnapshot', () => {
		it('returns a copy; mutations do not affect internal stack', () => {
			pushUndo({ type: 'obsidian' });
			const snapshot = getUndoStackSnapshot();
			(snapshot as UnifiedUndoEntry[]).push({ type: 'embed', embedId: 'x' } as UnifiedUndoEntry);

			expect(getUndoStackSnapshot()).toHaveLength(1);
			expect(getUndoStackSnapshot()[0]).toEqual({ type: 'obsidian' });
		});
	});

	describe('notifyUndoExecuted', () => {
		it('decrements prevObsidianDepth for obsidian entry', () => {
			initialize(3, 0, { [EMBED_ID]: 2 });
			notifyUndoExecuted({ type: 'obsidian' });
			setupSyncMocks(2, 2);
			syncUnifiedUndoHistory(EMBED_ID);
			expect(getUndoStackSnapshot()).toHaveLength(0);
			notifyUndoExecuted({ type: 'obsidian' });
			notifyUndoExecuted({ type: 'obsidian' });
			setupSyncMocks(0, 2);
			syncUnifiedUndoHistory(EMBED_ID);
			expect(getUndoStackSnapshot()).toHaveLength(0);
		});

		it('decrements prevTldrawUndos for embed entry', () => {
			initialize(0, 0);
			setupSyncMocks(0, 3);
			syncUnifiedUndoHistory(EMBED_ID);
			const entry = popUndo()!;
			notifyUndoExecuted(entry);
			setupSyncMocks(0, 3);
			syncUnifiedUndoHistory(EMBED_ID);
			expect(getUndoStackSnapshot()).toHaveLength(3);
		});
	});

	describe('notifyRedoExecuted', () => {
		it('increments prevObsidianDepth for obsidian entry', () => {
			initialize(0, 0);
			setupSyncMocks(1, 0);
			syncUnifiedUndoHistory(EMBED_ID);
			const entry = popUndo()!;
			notifyUndoExecuted(entry);
			pushRedo(entry);
			notifyRedoExecuted(entry);
			pushUndo(entry);
			setupSyncMocks(1, 0);
			syncUnifiedUndoHistory(EMBED_ID);
			expect(getUndoStackSnapshot().filter((e) => e.type === 'obsidian')).toHaveLength(1);
		});

		it('increments prevTldrawUndos for embed entry', () => {
			initialize(0, 0);
			setupSyncMocks(0, 1);
			syncUnifiedUndoHistory(EMBED_ID);
			const entry = popUndo()!;
			notifyUndoExecuted(entry);
			pushRedo(entry);
			notifyRedoExecuted(entry);
			pushUndo(entry);
			setupSyncMocks(0, 1);
			syncUnifiedUndoHistory(EMBED_ID);
			expect(getUndoStackSnapshot().filter((e) => e.type === 'embed')).toHaveLength(1);
		});
	});

	describe('syncUnifiedUndoHistory', () => {
		it('returns early when getEditor returns undefined', () => {
			mockGetEditor.mockReturnValue(undefined);
			syncUnifiedUndoHistory(EMBED_ID);
			expect(mockGetObsidianUndoDepth).not.toHaveBeenCalled();
			expect(getUndoStackSnapshot()).toHaveLength(0);
		});

		it('adds obsidian entries when obsidianDelta > 0', () => {
			initialize(0, 0);
			setupSyncMocks(2, 0);
			syncUnifiedUndoHistory(EMBED_ID);

			const stack = getUndoStackSnapshot();
			expect(stack).toHaveLength(2);
			expect(stack[0]).toEqual({ type: 'obsidian' });
			expect(stack[1]).toEqual({ type: 'obsidian' });
		});

		it('adds embed entries when tldrawDelta > 0', () => {
			initialize(0, 0);
			setupSyncMocks(0, 2);
			syncUnifiedUndoHistory(EMBED_ID);

			const stack = getUndoStackSnapshot();
			expect(stack).toHaveLength(2);
			expect(stack[0]).toEqual({ type: 'embed', embedId: EMBED_ID });
			expect(stack[1]).toEqual({ type: 'embed', embedId: EMBED_ID });
		});

		it('adds obsidian then embed entries in correct order', () => {
			initialize(0, 0);
			setupSyncMocks(1, 1);
			syncUnifiedUndoHistory(EMBED_ID);

			const stack = getUndoStackSnapshot();
			expect(stack).toHaveLength(2);
			expect(stack[0]).toEqual({ type: 'obsidian' });
			expect(stack[1]).toEqual({ type: 'embed', embedId: EMBED_ID });
		});

		it('respects maxTldrawDelta and caps embed entries', () => {
			initialize(0, 0);
			setupSyncMocks(0, 5);
			syncUnifiedUndoHistory(EMBED_ID, { maxTldrawDelta: 1 });

			const stack = getUndoStackSnapshot();
			expect(stack).toHaveLength(1);
			expect(stack[0]).toEqual({ type: 'embed', embedId: EMBED_ID });
		});

		it('clears redo stack when entries are added', () => {
			initialize(0, 0);
			pushRedo({ type: 'obsidian' });
			setupSyncMocks(1, 0);
			syncUnifiedUndoHistory(EMBED_ID);

			expect(isRedoStackEmpty()).toBe(true);
		});

		it('updates baseline after sync', () => {
			initialize(0, 0);
			setupSyncMocks(2, 3);
			syncUnifiedUndoHistory(EMBED_ID);
			expect(getUndoStackSnapshot()).toHaveLength(5);

			setupSyncMocks(2, 3);
			syncUnifiedUndoHistory(EMBED_ID);
			expect(getUndoStackSnapshot()).toHaveLength(5);
		});

		it('when programmatic redo flag is set: updates baseline, returns early, does not add entries or clear redo', () => {
			initialize(0, 0);
			pushRedo({ type: 'obsidian' });
			setProgrammaticRedoInProgress(true, MOCK_PLUGIN);
			mockGetGlobals.mockReturnValue({ plugin: MOCK_PLUGIN });
			setupSyncMocks(2, 3);
			syncUnifiedUndoHistory(EMBED_ID);

			expect(getUndoStackSnapshot()).toHaveLength(0);
			expect(isRedoStackEmpty()).toBe(false);
		});

		it('tracks tldraw baseline per embed when multiple embeds alternate strokes', () => {
			const EMBED_A = 'embed-a';
			const EMBED_B = 'embed-b';
			const EDITOR_A = {} as any;
			const EDITOR_B = {} as any;

			initialize(0, 0);
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

			syncUnifiedUndoHistory(EMBED_A);
			syncUnifiedUndoHistory(EMBED_B);
			syncUnifiedUndoHistory(EMBED_A);
			syncUnifiedUndoHistory(EMBED_B);

			const stack = getUndoStackSnapshot();
			expect(stack).toHaveLength(4);
			expect(stack[0]).toEqual({ type: 'embed', embedId: EMBED_A });
			expect(stack[1]).toEqual({ type: 'embed', embedId: EMBED_B });
			expect(stack[2]).toEqual({ type: 'embed', embedId: EMBED_A });
			expect(stack[3]).toEqual({ type: 'embed', embedId: EMBED_B });
		});
	});

	describe('clearEmbedBaseline', () => {
		it('removes embed baseline so next sync uses fresh baseline', () => {
			initialize(0, 0);
			setupSyncMocks(0, 2);
			syncUnifiedUndoHistory(EMBED_ID);
			expect(getUndoStackSnapshot()).toHaveLength(2);

			clearEmbedBaseline(EMBED_ID);
			setupSyncMocks(0, 1);
			syncUnifiedUndoHistory(EMBED_ID);
			expect(getUndoStackSnapshot()).toHaveLength(3);
		});
	});

	describe('purgeEmbedEntriesFromStacks', () => {
		const EMBED_A = 'embed-a';
		const EMBED_B = 'embed-b';

		it('removes embed entries from undo stack, leaves others', () => {
			pushUndo({ type: 'embed', embedId: EMBED_B });
			pushUndo({ type: 'embed', embedId: EMBED_A });
			pushUndo({ type: 'embed', embedId: EMBED_B });
			pushUndo({ type: 'embed', embedId: EMBED_A });

			purgeEmbedEntriesFromStacks(EMBED_A);

			const stack = getUndoStackSnapshot();
			expect(stack).toHaveLength(2);
			expect(stack[0]).toEqual({ type: 'embed', embedId: EMBED_B });
			expect(stack[1]).toEqual({ type: 'embed', embedId: EMBED_B });
		});

		it('removes embed entries from redo stack, leaves others', () => {
			pushUndo({ type: 'embed', embedId: EMBED_A });
			popUndo();
			pushRedo({ type: 'embed', embedId: EMBED_A });
			pushRedo({ type: 'embed', embedId: EMBED_B });
			pushRedo({ type: 'embed', embedId: EMBED_A });

			purgeEmbedEntriesFromStacks(EMBED_A);

			expect(popRedo()).toEqual({ type: 'embed', embedId: EMBED_B });
			expect(popRedo()).toBeNull();
		});

		it('leaves obsidian entries untouched', () => {
			pushUndo({ type: 'obsidian' });
			pushUndo({ type: 'embed', embedId: EMBED_A });
			pushUndo({ type: 'obsidian' });

			purgeEmbedEntriesFromStacks(EMBED_A);

			const stack = getUndoStackSnapshot();
			expect(stack).toHaveLength(2);
			expect(stack[0]).toEqual({ type: 'obsidian' });
			expect(stack[1]).toEqual({ type: 'obsidian' });
		});

		it('preserves relative order of remaining entries', () => {
			pushUndo({ type: 'embed', embedId: EMBED_B });
			pushUndo({ type: 'embed', embedId: EMBED_A });
			pushUndo({ type: 'obsidian' });
			pushUndo({ type: 'embed', embedId: EMBED_A });
			pushUndo({ type: 'embed', embedId: EMBED_B });

			purgeEmbedEntriesFromStacks(EMBED_A);

			const stack = getUndoStackSnapshot();
			expect(stack).toHaveLength(3);
			expect(stack[0]).toEqual({ type: 'embed', embedId: EMBED_B });
			expect(stack[1]).toEqual({ type: 'obsidian' });
			expect(stack[2]).toEqual({ type: 'embed', embedId: EMBED_B });
		});

		it('no-op when embed has no entries', () => {
			pushUndo({ type: 'embed', embedId: EMBED_B });
			pushUndo({ type: 'obsidian' });

			purgeEmbedEntriesFromStacks(EMBED_A);

			const stack = getUndoStackSnapshot();
			expect(stack).toHaveLength(2);
			expect(stack[0]).toEqual({ type: 'embed', embedId: EMBED_B });
			expect(stack[1]).toEqual({ type: 'obsidian' });
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
			initialize(0, 0);
			const plugin = {} as any;
			setProgrammaticRedoInProgress(true, plugin);
			mockGetGlobals.mockReturnValue({ plugin });
			mockGetEditor.mockReturnValue(MOCK_EDITOR);
			mockGetObsidianUndoDepth.mockReturnValue(2);
			mockGetTldrawNumUndos.mockReturnValue(2);

			syncUnifiedUndoHistory(EMBED_ID);

			expect(getUndoStackSnapshot()).toHaveLength(0);
			setProgrammaticRedoInProgress(false, plugin);
			mockGetObsidianUndoDepth.mockReturnValue(2);
			mockGetTldrawNumUndos.mockReturnValue(2);
			syncUnifiedUndoHistory(EMBED_ID);
			expect(getUndoStackSnapshot()).toHaveLength(0);
		});
	});
});
