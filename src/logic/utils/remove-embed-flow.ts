import { Notice, TFile } from 'obsidian';
import InkPlugin from 'src/main';
import { removeAllEmbedsOfFileFromNote } from 'src/logic/utils/convert-file-embeds';
import { RemoveEmbedModal } from 'src/components/dom-components/modals/remove-embed-modal/remove-embed-modal';

/**
 * Opens the remove-embed flow. Scans the vault for notes embedding the file.
 * If the file is only in the current note, shows a modal with two options:
 * - Remove embed only
 * - Remove and delete file
 * If the file is embedded elsewhere, removes the embed only without prompting.
 */
export function openRemoveEmbedFlow(
	plugin: InkPlugin,
	embeddedFile: TFile,
	sourceMdFile: TFile,
	embedType: 'inkWriting' | 'inkDrawing',
	removeEmbedOnlyFn: () => void,
): void {
	const modal = new RemoveEmbedModal(plugin, embeddedFile, embedType, {
		sourceMdFile,
		onRemoveEmbedOnly: removeEmbedOnlyFn,
		onRemoveEmbedAndFile: () => {
			void (async (): Promise<void> => {
				try {
					await removeAllEmbedsOfFileFromNote(
						plugin.app.vault,
						sourceMdFile,
						embeddedFile.path,
						embedType,
					);
					await plugin.app.vault.delete(embeddedFile);
				} catch (err) {
					new Notice('Failed to remove and delete file: ' + String(err));
				}
			})();
		},
	});
	modal.open();
}
