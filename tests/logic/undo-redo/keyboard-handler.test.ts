/**
 * Unit tests for keyboard-handler.ts (unified undo/redo keydown handler)
 * @see docs/undo-redo-implementation.md
 */

const mockGetActiveEmbedId = jest.fn();
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
const mockGetUndoStackSnapshot = jest.fn();
const mockGetEditor = jest.fn();
const mockGetResizeApplier = jest.fn();

jest.mock('src/logic/undo-redo/ink-editor-registry', () => ({
	getActiveEmbedId: () => mockGetActiveEmbedId(),
	getEditor: (embedId: string) => mockGetEditor(embedId),
	getResizeApplier: (embedId: string) => mockGetResizeApplier(embedId),
}));

jest.mock('src/logic/undo-redo/unified-undo-stack', () => ({
	syncUnifiedUndoHistory: (embedId: string, opts?: any) =>
		mockSyncUnifiedUndoHistory(embedId, opts),
	isUndoStackEmpty: () => mockIsUndoStackEmpty(),
	isRedoStackEmpty: () => mockIsRedoStackEmpty(),
	popUndo: () => mockPopUndo(),
	popRedo: () => mockPopRedo(),
	pushUndo: (entry: any) => mockPushUndo(entry),
	pushRedo: (entry: any) => mockPushRedo(entry),
	notifyUndoExecuted: (entry: any) => mockNotifyUndoExecuted(entry),
	notifyRedoExecuted: (entry: any) => mockNotifyRedoExecuted(entry),
	setProgrammaticRedoInProgress: (value: boolean, plugin?: any) =>
		mockSetProgrammaticRedoInProgress(value, plugin),
	getUndoStackSnapshot: () => mockGetUndoStackSnapshot(),
}));

import { registerUnifiedUndoRedo } from 'src/logic/undo-redo/keyboard-handler';

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

describe('keyboard-handler', () => {
	let plugin: ReturnType<typeof createMockPlugin>;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		mockGetUndoStackSnapshot.mockReturnValue([]);
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

	describe('when no active embed', () => {
		it('returns early and does not preventDefault for undo', () => {
			mockGetActiveEmbedId.mockReturnValue(null);
			const event = createUndoEvent();
			plugin._handlers[0](event);

			expect(event.preventDefault).not.toHaveBeenCalled();
			expect(mockSyncUnifiedUndoHistory).not.toHaveBeenCalled();
		});

		it('returns early and does not preventDefault for redo', () => {
			mockGetActiveEmbedId.mockReturnValue(null);
			const event = createRedoEvent();
			plugin._handlers[0](event);

			expect(event.preventDefault).not.toHaveBeenCalled();
			expect(mockSyncUnifiedUndoHistory).not.toHaveBeenCalled();
		});
	});

	describe('when active embed — undo', () => {
		it('calls sync, popUndo, notifyUndoExecuted, executeUndo, pushRedo in order', () => {
			mockGetActiveEmbedId.mockReturnValue(EMBED_ID);
			mockIsUndoStackEmpty.mockReturnValue(false);
			mockPopUndo.mockReturnValue(MOCK_ENTRY);
			mockGetEditor.mockReturnValue(MOCK_EDITOR);

			const event = createUndoEvent();
			plugin._handlers[0](event);

			expect(event.preventDefault).toHaveBeenCalled();
			expect(event.stopPropagation).toHaveBeenCalled();
			expect(mockSyncUnifiedUndoHistory).toHaveBeenCalledWith(EMBED_ID, undefined);
			expect(mockPopUndo).toHaveBeenCalled();
			expect(mockNotifyUndoExecuted).toHaveBeenCalledWith(MOCK_ENTRY);
			expect(MOCK_EDITOR.undo).toHaveBeenCalled();
			expect(mockPushRedo).toHaveBeenCalledWith(MOCK_ENTRY);
		});

		it('shows Notice when undo stack is empty', () => {
			mockGetActiveEmbedId.mockReturnValue(EMBED_ID);
			mockIsUndoStackEmpty.mockReturnValue(true);

			const event = createUndoEvent();
			plugin._handlers[0](event);

			expect(mockPopUndo).not.toHaveBeenCalled();
			expect(mockPushRedo).not.toHaveBeenCalled();
		});
	});

	describe('when active embed — redo', () => {
		it('calls sync, popRedo, notifyRedoExecuted, setProgrammaticRedoInProgress(true), executeRedo, pushUndo', () => {
			mockGetActiveEmbedId.mockReturnValue(EMBED_ID);
			mockIsRedoStackEmpty.mockReturnValue(false);
			mockPopRedo.mockReturnValue(MOCK_ENTRY);
			mockGetEditor.mockReturnValue(MOCK_EDITOR);

			const event = createRedoEvent();
			plugin._handlers[0](event);

			expect(event.preventDefault).toHaveBeenCalled();
			expect(mockSyncUnifiedUndoHistory).toHaveBeenCalledWith(EMBED_ID, undefined);
			expect(mockPopRedo).toHaveBeenCalled();
			expect(mockNotifyRedoExecuted).toHaveBeenCalledWith(MOCK_ENTRY);
			expect(mockSetProgrammaticRedoInProgress).toHaveBeenCalledWith(true, plugin);
			expect(MOCK_EDITOR.redo).toHaveBeenCalled();
			expect(mockPushUndo).toHaveBeenCalledWith(MOCK_ENTRY);
		});

		it('clears programmatic redo flag after 50ms via setTimeout', () => {
			mockGetActiveEmbedId.mockReturnValue(EMBED_ID);
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
			mockGetActiveEmbedId.mockReturnValue(EMBED_ID);
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
			mockGetActiveEmbedId.mockReturnValue(EMBED_ID);
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
			mockGetActiveEmbedId.mockReturnValue(EMBED_ID);
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
			mockGetActiveEmbedId.mockReturnValue(EMBED_ID);
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
