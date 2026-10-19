import { Notice, TFile } from 'obsidian';
import InkPlugin from 'src/main';
import { removeAllEmbedsOfFileFromNote } from 'src/logic/utils/convert-file-embeds';
import { RemoveEmbedModal } from 'src/components/dom-components/modals/remove-embed-modal/remove-embed-modal';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { resolveWritingSourceImageVaultPath } from 'src/logic/photo-trace/writing-photo-paths';

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
					await trashWritingSourcePhotoIfPresent(plugin, embeddedFile);
					// Respect user's trash-vs-permanent-delete preference.
					await plugin.app.fileManager.trashFile(embeddedFile);
				} catch (err) {
					new Notice('Failed to remove and delete file: ' + String(err));
				}
			})();
		},
	});
	modal.open();
}

async function trashWritingSourcePhotoIfPresent(
	plugin: InkPlugin,
	embeddedFile: TFile,
): Promise<void> {
	if (!embeddedFile.path.toLowerCase().endsWith('.svg')) return;
	try {
		const svgContent = await plugin.app.vault.read(embeddedFile);
		const pageData = extractInkJsonFromSvg(svgContent);
		const relatives = [pageData?.meta.sourceImage, pageData?.meta.transcriptImage];
		const trashed = new Set<string>();
		for (const relative of relatives) {
			if (!relative || trashed.has(relative)) continue;
			trashed.add(relative);
			const jpegPath = resolveWritingSourceImageVaultPath(embeddedFile.path, relative);
			const jpegFile = plugin.app.vault.getAbstractFileByPath(jpegPath);
			if (jpegFile instanceof TFile) {
				await plugin.app.fileManager.trashFile(jpegFile);
			}
		}
	} catch {
		// Best-effort cleanup; the SVG delete still proceeds.
	}
}
