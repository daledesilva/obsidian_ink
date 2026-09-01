import { MarkdownView, Notice, TFile } from 'obsidian';
import type InkPlugin from 'src/main';
import {
	allowNativeInkPdfPreviewsForNextExport,
	getInkSourcePathFromEmbedPath,
	writeInkPdfPreview,
} from 'src/logic/utils/ink-pdf-export';

const INK_IMAGE_MARKER_PATTERN = /!\[(InkWriting|InkDrawing)\]\(<([^>]+)>\)/g;

export type PrepareInkPdfResult = {
	prepared: number;
	missing: number;
};

export async function prepareNoteInkForPdfExport(
	plugin: InkPlugin,
	note: TFile,
): Promise<PrepareInkPdfResult> {
	const markdown = await plugin.app.vault.read(note);
	const sourcePaths = new Set<string>();

	for (const match of markdown.matchAll(INK_IMAGE_MARKER_PATTERN)) {
		sourcePaths.add(getInkSourcePathFromEmbedPath(match[2]));
	}

	let prepared = 0;
	let missing = 0;
	const previewBySourcePath = new Map<string, string>();

	for (const sourcePath of sourcePaths) {
		const sourceFile = plugin.app.metadataCache.getFirstLinkpathDest(sourcePath, note.path);
		if (!(sourceFile instanceof TFile) || sourceFile.extension.toLowerCase() !== 'svg') {
			missing += 1;
			continue;
		}

		const previewPath = await writeInkPdfPreview(plugin, sourceFile);
		previewBySourcePath.set(sourcePath, previewPath);
		prepared += 1;
	}

	const updatedMarkdown = markdown.replace(
		INK_IMAGE_MARKER_PATTERN,
		(fullMarker, altText: string, markerPath: string) => {
			const sourcePath = getInkSourcePathFromEmbedPath(markerPath);
			const previewPath = previewBySourcePath.get(sourcePath);
			if (!previewPath) return fullMarker;
			return `![${altText}](<${previewPath}>)`;
		},
	);

	if (updatedMarkdown !== markdown) {
		await plugin.app.vault.modify(note, updatedMarkdown);
	}

	return { prepared, missing };
}

export function registerPrepareInkPdfExportCommand(plugin: InkPlugin): void {
	plugin.addCommand({
		id: 'prepare-current-note-ink-for-pdf-export',
		name: 'Prepare current note handwriting for PDF export',
		checkCallback: (checking) => {
			const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view?.file) return false;
			if (checking) return true;

			void (async () => {
				new Notice('Preparing Ink handwriting for PDF export…');
				try {
					const result = await prepareNoteInkForPdfExport(plugin, view.file as TFile);
					const missingSuffix = result.missing > 0
						? ` (${result.missing} missing attachment${result.missing === 1 ? '' : 's'} skipped)`
						: '';
					new Notice(`Ink PDF previews ready: ${result.prepared}${missingSuffix}`);
				} catch (error) {
					console.error('Unable to prepare Ink handwriting for PDF export', error);
					new Notice('Could not prepare Ink handwriting for PDF export. See console for details.');
				}
			})();
			return true;
		},
	});

	plugin.addCommand({
		id: 'export-current-note-to-pdf-with-ink',
		name: 'Export current note to PDF with Ink',
		checkCallback: (checking) => {
			const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view?.file) return false;
			if (checking) return true;

			void (async () => {
				new Notice('Preparing Ink handwriting for PDF export…');
				try {
					const result = await prepareNoteInkForPdfExport(plugin, view.file as TFile);
					allowNativeInkPdfPreviewsForNextExport();
					const appWithCommands = plugin.app as typeof plugin.app & {
						commands?: { executeCommandById: (id: string) => boolean };
					};
					const opened = appWithCommands.commands?.executeCommandById('workspace:export-pdf') ?? false;
					if (!opened) {
						new Notice('Ink previews are ready. Run Obsidian’s “Export to PDF” command now.');
						return;
					}
					if (result.missing > 0) {
						new Notice(`${result.missing} missing Ink attachment${result.missing === 1 ? '' : 's'} skipped.`);
					}
				} catch (error) {
					console.error('Unable to export PDF with Ink handwriting', error);
					new Notice('Could not prepare Ink handwriting for PDF export. See console for details.');
				}
			})();
			return true;
		},
	});
}
