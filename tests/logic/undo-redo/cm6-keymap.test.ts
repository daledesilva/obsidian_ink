/**
 * Unit tests for cm6-keymap.ts (unified undo/redo keymap interception)
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
const mockGetEditor = jest.fn();
const mockGetResizeApplier = jest.fn();

jest.mock('src/logic/undo-redo/ink-editor-registry', () => ({
	getActiveEmbedId: () => mockGetActiveEmbedId(),
	getEditor: (embedId: string) => mockGetEditor(embedId),
	getResizeApplier: (embedId: string) => mockGetResizeApplier(embedId),
}));

jest.mock('src/logic/undo-redo/unified-undo-stack', () => ({
	syncUnifiedUndoHistory: (embedId: string, opts?: any) => mockSyncUnifiedUndoHistory(embedId, opts),
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
	getUndoStackSnapshot: jest.fn(() => []),
}));

import type InkPlugin from 'src/main';
import { unifiedRedoKeymapCommand, unifiedUndoKeymapCommand } from 'src/logic/undo-redo/cm6-keymap';

const EMBED_ID = 'embed-1';
const MOCK_ENTRY = { type: 'embed' as const, embedId: EMBED_ID };
const MOCK_EDITOR = { undo: jest.fn(), redo: jest.fn() };

function createMockPlugin(): InkPlugin {
	return {
		registerDomEvent: jest.fn(),
		registerEditorExtension: jest.fn(),
		addCommand: jest.fn(),
		app: {
			workspace: {
				getActiveViewOfType: jest.fn(() => ({ editor: null })),
			},
		},
		settings: {} as any,
		loadSettings: jest.fn(),
		onunload: jest.fn(),
		loadData: jest.fn(),
		saveData: jest.fn(),
		resetSettings: jest.fn(),
		// Minimal shape for tests; real plugin instance methods aren't needed here.
	} as any;
}

function createFakeEditorView(): any {
	return {} as any;
}

describe('cm6-keymap', () => {
	let plugin: InkPlugin;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		mockGetActiveEmbedId.mockReturnValue(null);
		mockIsUndoStackEmpty.mockReturnValue(true);
		mockIsRedoStackEmpty.mockReturnValue(true);
		mockGetEditor.mockReturnValue(undefined);
		plugin = createMockPlugin();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('unified undo keymap returns false when activeEmbedId is null', () => {
		const command = unifiedUndoKeymapCommand(plugin);
		const handled = command(createFakeEditorView());

		expect(handled).toBe(false);
		expect(mockSyncUnifiedUndoHistory).not.toHaveBeenCalled();
	});

	it('unified undo keymap returns true and runs unified undo when active', () => {
		mockGetActiveEmbedId.mockReturnValue(EMBED_ID);
		mockIsUndoStackEmpty.mockReturnValue(false);
		mockPopUndo.mockReturnValue(MOCK_ENTRY);
		mockGetEditor.mockReturnValue(MOCK_EDITOR);

		const command = unifiedUndoKeymapCommand(plugin);
		const handled = command(createFakeEditorView());

		expect(handled).toBe(true);
		expect(mockSyncUnifiedUndoHistory).toHaveBeenCalledWith(EMBED_ID, undefined);
		expect(mockPopUndo).toHaveBeenCalled();
		expect(mockNotifyUndoExecuted).toHaveBeenCalledWith(MOCK_ENTRY);
		expect(MOCK_EDITOR.undo).toHaveBeenCalled();
		expect(mockPushRedo).toHaveBeenCalledWith(MOCK_ENTRY);
	});

	it('unified redo keymap returns true and runs unified redo when active', () => {
		mockGetActiveEmbedId.mockReturnValue(EMBED_ID);
		mockIsRedoStackEmpty.mockReturnValue(false);
		mockPopRedo.mockReturnValue(MOCK_ENTRY);
		mockGetEditor.mockReturnValue(MOCK_EDITOR);

		const command = unifiedRedoKeymapCommand(plugin);
		const handled = command(createFakeEditorView());

		expect(handled).toBe(true);
		expect(mockSyncUnifiedUndoHistory).toHaveBeenCalledWith(EMBED_ID, undefined);
		expect(mockPopRedo).toHaveBeenCalled();
		expect(mockNotifyRedoExecuted).toHaveBeenCalledWith(MOCK_ENTRY);
		expect(mockSetProgrammaticRedoInProgress).toHaveBeenCalledWith(true, plugin);
		expect(MOCK_EDITOR.redo).toHaveBeenCalled();
		expect(mockPushUndo).toHaveBeenCalledWith(MOCK_ENTRY);

		jest.advanceTimersByTime(50);
		expect(mockSetProgrammaticRedoInProgress).toHaveBeenLastCalledWith(false, plugin);
	});
});

