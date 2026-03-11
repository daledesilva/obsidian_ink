/**
 * Unit tests for src/logic/utils/remove-embed-flow.ts
 */

import { TFile } from 'obsidian';
import { openRemoveEmbedFlow } from 'src/logic/utils/remove-embed-flow';

const mockRemoveAllEmbedsOfFileFromNote = jest.fn();
const mockVaultDelete = jest.fn();
const mockModalOpen = jest.fn();

let capturedModalConstructorArgs: {
	plugin: any;
	embeddedFile: TFile;
	embedType: 'inkWriting' | 'inkDrawing';
	opts: { sourceMdFile: TFile; onRemoveEmbedOnly: () => void; onRemoveEmbedAndFile: () => void };
} | null = null;

jest.mock('src/logic/utils/convert-file-embeds', () => ({
	removeAllEmbedsOfFileFromNote: (...args: unknown[]) => mockRemoveAllEmbedsOfFileFromNote(...args),
}));

jest.mock('src/components/dom-components/modals/remove-embed-modal/remove-embed-modal', () => ({
	RemoveEmbedModal: class MockRemoveEmbedModal {
		constructor(
			plugin: any,
			embeddedFile: TFile,
			embedType: 'inkWriting' | 'inkDrawing',
			opts: { sourceMdFile: TFile; onRemoveEmbedOnly: () => void; onRemoveEmbedAndFile: () => void },
		) {
			capturedModalConstructorArgs = { plugin, embeddedFile, embedType, opts };
		}
		open = mockModalOpen;
	},
}));

function makePlugin() {
	return {
		app: {
			vault: {
				delete: mockVaultDelete,
			},
		},
	} as any;
}

describe('openRemoveEmbedFlow', () => {
	const embeddedFile = { path: 'Ink/Writing/test.svg' } as TFile;
	const sourceMdFile = { path: 'Notes/A.md' } as TFile;
	const removeEmbedOnlyFn = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
		capturedModalConstructorArgs = null;
		mockRemoveAllEmbedsOfFileFromNote.mockResolvedValue(undefined);
		mockVaultDelete.mockResolvedValue(undefined);
	});

	it('creates RemoveEmbedModal with correct params and calls open', () => {
		const plugin = makePlugin();
		openRemoveEmbedFlow(plugin, embeddedFile, sourceMdFile, 'inkWriting', removeEmbedOnlyFn);

		expect(capturedModalConstructorArgs).not.toBeNull();
		expect(capturedModalConstructorArgs!.plugin).toBe(plugin);
		expect(capturedModalConstructorArgs!.embeddedFile).toBe(embeddedFile);
		expect(capturedModalConstructorArgs!.embedType).toBe('inkWriting');
		expect(capturedModalConstructorArgs!.opts.sourceMdFile).toBe(sourceMdFile);
		expect(capturedModalConstructorArgs!.opts.onRemoveEmbedOnly).toBe(removeEmbedOnlyFn);
		expect(typeof capturedModalConstructorArgs!.opts.onRemoveEmbedAndFile).toBe('function');
		expect(mockModalOpen).toHaveBeenCalledTimes(1);
	});

	it('onRemoveEmbedAndFile calls removeAllEmbedsOfFileFromNote then vault.delete', async () => {
		const plugin = makePlugin();
		openRemoveEmbedFlow(plugin, embeddedFile, sourceMdFile, 'inkWriting', removeEmbedOnlyFn);

		const onRemoveEmbedAndFile = capturedModalConstructorArgs!.opts.onRemoveEmbedAndFile;
		await onRemoveEmbedAndFile();

		expect(mockRemoveAllEmbedsOfFileFromNote).toHaveBeenCalledTimes(1);
		expect(mockRemoveAllEmbedsOfFileFromNote).toHaveBeenCalledWith(
			plugin.app.vault,
			sourceMdFile,
			embeddedFile.path,
			'inkWriting',
		);
		expect(mockVaultDelete).toHaveBeenCalledTimes(1);
		expect(mockVaultDelete).toHaveBeenCalledWith(embeddedFile);
	});

	it('onRemoveEmbedAndFile passes correct embedType for inkDrawing', async () => {
		const plugin = makePlugin();
		openRemoveEmbedFlow(plugin, embeddedFile, sourceMdFile, 'inkDrawing', removeEmbedOnlyFn);

		const onRemoveEmbedAndFile = capturedModalConstructorArgs!.opts.onRemoveEmbedAndFile;
		await onRemoveEmbedAndFile();

		expect(mockRemoveAllEmbedsOfFileFromNote).toHaveBeenCalledWith(
			plugin.app.vault,
			sourceMdFile,
			embeddedFile.path,
			'inkDrawing',
		);
		expect(mockVaultDelete).toHaveBeenCalledWith(embeddedFile);
	});

	it('onRemoveEmbedOnly does not call vault.delete', () => {
		const plugin = makePlugin();
		openRemoveEmbedFlow(plugin, embeddedFile, sourceMdFile, 'inkWriting', removeEmbedOnlyFn);

		capturedModalConstructorArgs!.opts.onRemoveEmbedOnly();

		expect(removeEmbedOnlyFn).toHaveBeenCalledTimes(1);
		expect(mockVaultDelete).not.toHaveBeenCalled();
		expect(mockRemoveAllEmbedsOfFileFromNote).not.toHaveBeenCalled();
	});

	it('vault.delete called exactly once with embeddedFile when onRemoveEmbedAndFile runs', async () => {
		const plugin = makePlugin();
		openRemoveEmbedFlow(plugin, embeddedFile, sourceMdFile, 'inkWriting', removeEmbedOnlyFn);

		await capturedModalConstructorArgs!.opts.onRemoveEmbedAndFile();

		expect(mockVaultDelete).toHaveBeenCalledTimes(1);
		expect(mockVaultDelete).toHaveBeenCalledWith(embeddedFile);
	});
});
