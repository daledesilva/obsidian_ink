import { TFile } from 'obsidian';
import { InkFileData } from '../types/file-data';
import InkPlugin from 'src/main';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';

////////
////////

/**
 * Stroke saves must not advance bbox occupancy — only saveWriteFileTranscript after
 * a successful apply writes a new snapshot. Copy fields from disk so live ink can
 * diverge while stored cells still fingerprint last successful transcription.
 */
export async function preserveBboxCellsOnStrokeSave(
	plugin: InkPlugin,
	inkFile: TFile,
	pageData: InkFileData,
): Promise<void> {
	try {
		const existingSvg = await plugin.app.vault.read(inkFile);
		const existingPageData = extractInkJsonFromSvg(existingSvg);
		if (existingPageData?.meta.bboxCellsAtLastTranscription) {
			pageData.meta.bboxCellsAtLastTranscription = existingPageData.meta.bboxCellsAtLastTranscription;
			pageData.meta.lastTranscriptionAt = existingPageData.meta.lastTranscriptionAt;
			return;
		}
	} catch {
		// Unreadable file — fall through and strip fingerprint fields.
	}
	delete pageData.meta.bboxCellsAtLastTranscription;
	delete pageData.meta.lastTranscriptionAt;
}
