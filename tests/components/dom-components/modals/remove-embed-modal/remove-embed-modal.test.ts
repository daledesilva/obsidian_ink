/**
 * Unit tests for RemoveEmbedModal
 */

import { TFile } from 'obsidian';
import { RemoveEmbedModal } from 'src/components/dom-components/modals/remove-embed-modal/remove-embed-modal';
import { findNotesContainingFileEmbed, countFileEmbedOccurrencesInVault } from 'src/logic/utils/convert-file-embeds';

jest.mock('src/logic/utils/convert-file-embeds', () => ({
	findNotesContainingFileEmbed: jest.fn(),
	countFileEmbedOccurrencesInVault: jest.fn(),
}));

function makePlugin() {
	return {
		app: {
			vault: {},
		},
	} as any;
}

describe('RemoveEmbedModal', () => {
	const embeddedFile = { path: 'Ink/Writing/test.svg' } as TFile;
	const sourceMdFile = { path: 'Notes/A.md' } as TFile;
	const otherNote = { path: 'Notes/B.md' } as TFile;

	beforeEach(() => {
		jest.clearAllMocks();
		(countFileEmbedOccurrencesInVault as jest.Mock).mockResolvedValue(1);
	});

	describe('scan phase', () => {
		it('calls findNotesContainingFileEmbed with correct vault, path, and embedType', async () => {
			(findNotesContainingFileEmbed as jest.Mock).mockResolvedValueOnce([sourceMdFile]);

			const plugin = makePlugin();
			const modal = new RemoveEmbedModal(plugin, embeddedFile, 'inkWriting', {
				sourceMdFile,
				onRemoveEmbedOnly: jest.fn(),
				onRemoveEmbedAndFile: jest.fn(),
			});

			modal.onOpen();

			expect(findNotesContainingFileEmbed).toHaveBeenCalledWith(
				plugin.app.vault,
				embeddedFile.path,
				'inkWriting',
				expect.any(Function),
			);

			await new Promise((r) => setTimeout(r, 0));
		});
	});

	describe('when notes.length > 1', () => {
		it('calls onRemoveEmbedOnly and closes without showing confirm phase', async () => {
			(findNotesContainingFileEmbed as jest.Mock).mockResolvedValueOnce([sourceMdFile, otherNote]);

			const plugin = makePlugin();
			const onRemoveEmbedOnly = jest.fn();
			const onRemoveEmbedAndFile = jest.fn();
			const modal = new RemoveEmbedModal(plugin, embeddedFile, 'inkWriting', {
				sourceMdFile,
				onRemoveEmbedOnly,
				onRemoveEmbedAndFile,
			});
			modal.close = jest.fn();

			modal.onOpen();

			await new Promise((r) => setTimeout(r, 0));

			expect(onRemoveEmbedOnly).toHaveBeenCalledTimes(1);
			expect(onRemoveEmbedAndFile).not.toHaveBeenCalled();
			expect(modal.close).toHaveBeenCalled();
		});
	});

	describe('when notes.length === 1', () => {
		it('does not call onRemoveEmbedOnly immediately when only one embed exists (shows confirm phase instead)', async () => {
			(findNotesContainingFileEmbed as jest.Mock).mockResolvedValueOnce([sourceMdFile]);
			(countFileEmbedOccurrencesInVault as jest.Mock).mockResolvedValueOnce(1);

			const plugin = makePlugin();
			const onRemoveEmbedOnly = jest.fn();
			const onRemoveEmbedAndFile = jest.fn();
			const modal = new RemoveEmbedModal(plugin, embeddedFile, 'inkWriting', {
				sourceMdFile,
				onRemoveEmbedOnly,
				onRemoveEmbedAndFile,
			});

			modal.onOpen();

			await new Promise((r) => setTimeout(r, 0));

			// Unlike notes.length > 1, we show confirm phase — callbacks not invoked yet
			expect(onRemoveEmbedOnly).not.toHaveBeenCalled();
			expect(onRemoveEmbedAndFile).not.toHaveBeenCalled();
		});

		it('calls onRemoveEmbedOnly when the same note embeds the file more than once', async () => {
			(findNotesContainingFileEmbed as jest.Mock).mockResolvedValueOnce([sourceMdFile]);
			(countFileEmbedOccurrencesInVault as jest.Mock).mockResolvedValueOnce(2);

			const plugin = makePlugin();
			const onRemoveEmbedOnly = jest.fn();
			const onRemoveEmbedAndFile = jest.fn();
			const modal = new RemoveEmbedModal(plugin, embeddedFile, 'inkWriting', {
				sourceMdFile,
				onRemoveEmbedOnly,
				onRemoveEmbedAndFile,
			});
			modal.close = jest.fn();

			modal.onOpen();

			await new Promise((r) => setTimeout(r, 0));

			expect(onRemoveEmbedOnly).toHaveBeenCalledTimes(1);
			expect(onRemoveEmbedAndFile).not.toHaveBeenCalled();
			expect(modal.close).toHaveBeenCalled();
		});

		it('Cancel closes modal', async () => {
			(findNotesContainingFileEmbed as jest.Mock).mockResolvedValueOnce([sourceMdFile]);

			const plugin = makePlugin();
			const modal = new RemoveEmbedModal(plugin, embeddedFile, 'inkWriting', {
				sourceMdFile,
				onRemoveEmbedOnly: jest.fn(),
				onRemoveEmbedAndFile: jest.fn(),
			});
			modal.close = jest.fn();

			modal.onOpen();

			await new Promise((r) => setTimeout(r, 0));

			modal.close();
			expect(modal.close).toHaveBeenCalled();
		});
	});

	describe('error handling', () => {
		it('on scan failure does not invoke callbacks', async () => {
			(findNotesContainingFileEmbed as jest.Mock).mockRejectedValueOnce(new Error('Vault read failed'));

			const plugin = makePlugin();
			const onRemoveEmbedOnly = jest.fn();
			const onRemoveEmbedAndFile = jest.fn();
			const modal = new RemoveEmbedModal(plugin, embeddedFile, 'inkWriting', {
				sourceMdFile,
				onRemoveEmbedOnly,
				onRemoveEmbedAndFile,
			});

			modal.onOpen();

			await new Promise((r) => setTimeout(r, 0));
			await new Promise((r) => setTimeout(r, 0));

			expect(onRemoveEmbedOnly).not.toHaveBeenCalled();
			expect(onRemoveEmbedAndFile).not.toHaveBeenCalled();
		});
	});
});
