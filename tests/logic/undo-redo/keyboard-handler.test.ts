/**
 * Unit tests for keyboard-handler.ts (unified undo/redo keydown handler)
 * @see docs/undo-redo-implementation.md
 */

const mockGetActiveEmbedIdForLeaf = jest.fn();
const mockSyncUnifiedUndoHistory = jest.fn();
const mockIsUndoStackEmpty = jest.fn();
const mockIsRedoStackEmpty = jest.fn();
const mockPopUndo = jest.fn();
const mockPopRedo = jest.fn();
const mockPushUndo = jest.fn();
const mockPushRedo = jest.fn();
const mockNotifyUndoExecuted = jest.fn();
const mockNotifyRedoExecuted = jest.fn();
const mockSetProgrammaticRedoInProgress = jest.fn();
const mockSetProgrammaticUndoInProgress = jest.fn();
const mockGetUndoStackSnapshot = jest.fn();
const mockGetEditor = jest.fn();
const mockGetResizeApplier = jest.fn();
const mockGetDedicatedInkEditor = jest.fn();
const mockGetRegisteredEmbedIdsForLeaf = jest.fn();

jest.mock('src/logic/undo-redo/ink-editor-registry', () => ({
	getActiveEmbedIdForLeaf: (leafId: string) => mockGetActiveEmbedIdForLeaf(leafId),
	getEditor: (embedId: string) => mockGetEditor(embedId),
	getResizeApplier: (embedId: string) => mockGetResizeApplier(embedId),
	getRegisteredEmbedIdsForLeaf: (leafId: string) => mockGetRegisteredEmbedIdsForLeaf(leafId),
	getRegisteredEmbedCountForLeaf: () => 0,
}));

jest.mock('src/logic/undo-redo/dedicated-ink-editor-registry', () => ({
	getDedicatedInkEditor: (leafId: string) => mockGetDedicatedInkEditor(leafId),
}));

jest.mock('src/logic/undo-redo/unified-undo-stack', () => ({
	syncUnifiedUndoHistory: (leafId: string, embedId: string, opts?: any) =>
		mockSyncUnifiedUndoHistory(leafId, embedId, opts),
	isUndoStackEmpty: (leafId: string) => mockIsUndoStackEmpty(leafId),
	isRedoStackEmpty: (leafId: string) => mockIsRedoStackEmpty(leafId),
	popUndo: (leafId: string) => mockPopUndo(leafId),
	popRedo: (leafId: string) => mockPopRedo(leafId),
	pushUndo: (leafId: string, entry: any) => mockPushUndo(leafId, entry),
	pushRedo: (leafId: string, entry: any) => mockPushRedo(leafId, entry),
	notifyUndoExecuted: (leafId: string, entry: any) => mockNotifyUndoExecuted(leafId, entry),
	notifyRedoExecuted: (leafId: string, entry: any) => mockNotifyRedoExecuted(leafId, entry),
	setProgrammaticRedoInProgress: (value: boolean, plugin?: any) =>
		mockSetProgrammaticRedoInProgress(value, plugin),
	setProgrammaticUndoInProgress: (value: boolean, plugin?: any) =>
		mockSetProgrammaticUndoInProgress(value, plugin),
	getUndoStackSnapshot: (leafId: string) => mockGetUndoStackSnapshot(leafId),
}));

import { registerUnifiedUndoRedo } from 'src/logic/undo-redo/keyboard-handler';

const LEAF_ID = 'leaf-test';
const EMBED_ID = 'embed-1';
const MOCK_ENTRY = { type: 'embed' as const, embedId: EMBED_ID };
const MOCK_EDITOR = { undo: jest.fn(), redo: jest.fn() };

function createMockPlugin() {
	const handlers: Array<(event: KeyboardEvent) => void> = [];
	return {
		registerDomEvent: jest.fn(
			(_target: Document, _event: string, handler: (e: KeyboardEvent) => void) => {
				handlers.push(handler);
				return () => {};
			},
		),
		_handlers: handlers,
		app: {
			workspace: {
				activeLeaf: { id: LEAF_ID, view: { getViewType: () => 'markdown' } },
				getMostRecentLeaf: jest.fn(() => ({ id: LEAF_ID, view: { getViewType: () => 'markdown' } })),
				getActiveViewOfType: jest.fn(() => ({ editor: null })),
			},
		},
	};
}

function createUndoEvent(shift = false): KeyboardEvent {
	return {
		metaKey: true,
		ctrlKey: false,
		key: 'z',
		shiftKey: shift,
		preventDefault: jest.fn(),
		stopPropagation: jest.fn(),
	} as unknown as KeyboardEvent;
}

function createRedoEvent(): KeyboardEvent {
	return createUndoEvent(true);
}

function createKeyboardEvent(params: { key: string; shiftKey: boolean }): KeyboardEvent {
	return {
		metaKey: true,
		ctrlKey: false,
		key: params.key,
		shiftKey: params.shiftKey,
		preventDefault: jest.fn(),
		stopPropagation: jest.fn(),
	} as unknown as KeyboardEvent;
}

function createUndoUppercaseZEvent(): KeyboardEvent {
	return createKeyboardEvent({ key: 'Z', shiftKey: false });
}

describe('keyboard-handler', () => {
	let plugin: ReturnType<typeof createMockPlugin>;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		mockGetUndoStackSnapshot.mockReturnValue([]);
		mockGetDedicatedInkEditor.mockReturnValue(null);
		mockGetRegisteredEmbedIdsForLeaf.mockReturnValue([EMBED_ID]);
		plugin = createMockPlugin();
		registerUnifiedUndoRedo(plugin as any);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('registers keydown handler on document', () => {
		expect(plugin.registerDomEvent).toHaveBeenCalledWith(
			document,
			'keydown',
			expect.any(Function),
			{ capture: true },
		);
	});

	describe('when no active embed for leaf', () => {
		it('returns early and does not preventDefault for undo', () => {
			mockGetActiveEmbedIdForLeaf.mockReturnValue(null);
			const event = createUndoEvent();
			plugin._handlers[0](event);

			expect(event.preventDefault).not.toHaveBeenCalled();
			expect(mockSyncUnifiedUndoHistory).not.toHaveBeenCalled();
		});

		it('returns early and does not preventDefault for redo', () => {
			mockGetActiveEmbedIdForLeaf.mockReturnValue(null);
			const event = createRedoEvent();
			plugin._handlers[0](event);

			expect(event.preventDefault).not.toHaveBeenCalled();
			expect(mockSyncUnifiedUndoHistory).not.toHaveBeenCalled();
		});
	});

	describe('when active embed — undo', () => {
		it('calls sync, popUndo, notifyUndoExecuted, executeUndo, pushRedo in order', () => {
			mockGetActiveEmbedIdForLeaf.mockReturnValue(EMBED_ID);
			mockIsUndoStackEmpty.mockReturnValue(false);
			mockPopUndo.mockReturnValue(MOCK_ENTRY);
			mockGetEditor.mockReturnValue(MOCK_EDITOR);

			const event = createUndoEvent();
			plugin._handlers[0](event);

			expect(event.preventDefault).toHaveBeenCalled();
			expect(event.stopPropagation).toHaveBeenCalled();
			expect(mockSyncUnifiedUndoHistory).toHaveBeenCalledWith(LEAF_ID, EMBED_ID, { skipEmbed: true });
			expect(mockPopUndo).toHaveBeenCalledWith(LEAF_ID);
			expect(mockNotifyUndoExecuted).toHaveBeenCalledWith(LEAF_ID, MOCK_ENTRY);
			expect(MOCK_EDITOR.undo).toHaveBeenCalled();
			expect(mockPushRedo).toHaveBeenCalledWith(LEAF_ID, MOCK_ENTRY);
		});

		it('matches undo case-insensitively for Z', () => {
			mockGetActiveEmbedIdForLeaf.mockReturnValue(EMBED_ID);
			mockIsUndoStackEmpty.mockReturnValue(false);
			mockPopUndo.mockReturnValue(MOCK_ENTRY);
			mockGetEditor.mockReturnValue(MOCK_EDITOR);

			const event = createUndoUppercaseZEvent();
			plugin._handlers[0](event);

			expect(event.preventDefault).toHaveBeenCalled();
			expect(mockPopUndo).toHaveBeenCalledWith(LEAF_ID);
			expect(MOCK_EDITOR.undo).toHaveBeenCalled();
		});

		it('shows Notice when undo stack is empty', () => {
			mockGetActiveEmbedIdForLeaf.mockReturnValue(EMBED_ID);
			mockIsUndoStackEmpty.mockReturnValue(true);

			const event = createUndoEvent();
			plugin._handlers[0](event);

			expect(mockPopUndo).not.toHaveBeenCalled();
			expect(mockPushRedo).not.toHaveBeenCalled();
		});
	});

	describe('when active embed — redo', () => {
		it('calls sync, popRedo, notifyRedoExecuted, setProgrammaticRedoInProgress(true), executeRedo, pushUndo', () => {
			mockGetActiveEmbedIdForLeaf.mockReturnValue(EMBED_ID);
			mockIsRedoStackEmpty.mockReturnValue(false);
			mockPopRedo.mockReturnValue(MOCK_ENTRY);
			mockGetEditor.mockReturnValue(MOCK_EDITOR);

			const event = createRedoEvent();
			plugin._handlers[0](event);

			expect(event.preventDefault).toHaveBeenCalled();
			expect(mockSyncUnifiedUndoHistory).toHaveBeenCalledWith(LEAF_ID, EMBED_ID, { skipEmbed: true });
			expect(mockPopRedo).toHaveBeenCalledWith(LEAF_ID);
			expect(mockNotifyRedoExecuted).toHaveBeenCalledWith(LEAF_ID, MOCK_ENTRY);
			expect(mockSetProgrammaticRedoInProgress).toHaveBeenCalledWith(true, plugin);
			expect(MOCK_EDITOR.redo).toHaveBeenCalled();
			expect(mockPushUndo).toHaveBeenCalledWith(LEAF_ID, MOCK_ENTRY);
		});

		it('clears programmatic redo flag after 50ms via setTimeout', () => {
			mockGetActiveEmbedIdForLeaf.mockReturnValue(EMBED_ID);
			mockIsRedoStackEmpty.mockReturnValue(false);
			mockPopRedo.mockReturnValue(MOCK_ENTRY);
			mockGetEditor.mockReturnValue(MOCK_EDITOR);

			const event = createRedoEvent();
			plugin._handlers[0](event);

			expect(mockSetProgrammaticRedoInProgress).toHaveBeenCalledWith(true, plugin);
			expect(mockSetProgrammaticRedoInProgress).toHaveBeenCalledTimes(1);

			jest.advanceTimersByTime(50);

			expect(mockSetProgrammaticRedoInProgress).toHaveBeenCalledTimes(2);
			expect(mockSetProgrammaticRedoInProgress).toHaveBeenLastCalledWith(false, plugin);
		});

		it('returns early when redo stack is empty', () => {
			mockGetActiveEmbedIdForLeaf.mockReturnValue(EMBED_ID);
			mockIsRedoStackEmpty.mockReturnValue(true);

			const event = createRedoEvent();
			plugin._handlers[0](event);

			expect(mockPopRedo).not.toHaveBeenCalled();
			expect(mockSetProgrammaticRedoInProgress).not.toHaveBeenCalled();
		});
	});

	describe('embed-resize undo', () => {
		it('calls getResizeApplier with fromWidth and fromAspectRatio', () => {
			const resizeEntry = {
				type: 'embed-resize' as const,
				embedId: EMBED_ID,
				fromWidth: 500,
				fromAspectRatio: 16 / 9,
				toWidth: 600,
				toAspectRatio: 4 / 3,
			};
			const mockApplier = jest.fn();
			mockGetActiveEmbedIdForLeaf.mockReturnValue(EMBED_ID);
			mockIsUndoStackEmpty.mockReturnValue(false);
			mockPopUndo.mockReturnValue(resizeEntry);
			mockGetResizeApplier.mockReturnValue(mockApplier);

			const event = createUndoEvent();
			plugin._handlers[0](event);

			expect(mockGetResizeApplier).toHaveBeenCalledWith(EMBED_ID);
			expect(mockApplier).toHaveBeenCalledWith(500, 16 / 9);
			expect(mockGetEditor).not.toHaveBeenCalled();
		});
	});

	describe('embed-resize redo', () => {
		it('calls getResizeApplier with toWidth and toAspectRatio', () => {
			const resizeEntry = {
				type: 'embed-resize' as const,
				embedId: EMBED_ID,
				fromWidth: 500,
				fromAspectRatio: 16 / 9,
				toWidth: 600,
				toAspectRatio: 4 / 3,
			};
			const mockApplier = jest.fn();
			mockGetActiveEmbedIdForLeaf.mockReturnValue(EMBED_ID);
			mockIsRedoStackEmpty.mockReturnValue(false);
			mockPopRedo.mockReturnValue(resizeEntry);
			mockGetResizeApplier.mockReturnValue(mockApplier);

			const event = createRedoEvent();
			plugin._handlers[0](event);

			expect(mockGetResizeApplier).toHaveBeenCalledWith(EMBED_ID);
			expect(mockApplier).toHaveBeenCalledWith(600, 4 / 3);
			expect(mockGetEditor).not.toHaveBeenCalled();
		});
	});

	describe('Ctrl+Z (Windows/Linux)', () => {
		it('handles ctrlKey for undo', () => {
			mockGetActiveEmbedIdForLeaf.mockReturnValue(EMBED_ID);
			mockIsUndoStackEmpty.mockReturnValue(false);
			mockPopUndo.mockReturnValue(MOCK_ENTRY);
			mockGetEditor.mockReturnValue(MOCK_EDITOR);

			const event = {
				...createUndoEvent(),
				metaKey: false,
				ctrlKey: true,
			} as KeyboardEvent;
			plugin._handlers[0](event);

			expect(mockSyncUnifiedUndoHistory).toHaveBeenCalled();
		});
	});
});
