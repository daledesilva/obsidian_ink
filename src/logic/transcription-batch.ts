import { TFile } from 'obsidian';
import InkPlugin from 'src/main';
import type { InkFileData } from 'src/components/formats/current/types/file-data';
import { extractInkJsonFromSvg, sniffInkSvgFileType } from 'src/logic/utils/extractInkJsonFromSvg';
import { enqueueManualTranscription } from 'src/logic/handwriting-transcription-queue';
import type { HandwritingTranscriptionFileType } from 'src/logic/handwriting-transcription-queue-store';

//////////
//////////

/** How a batch run decides which files to send. */
export type TranscriptionBatchScope = 'missing-only' | 'everything';

/** Concurrent reads while sniffing the vault; matches the ink file picker. */
const BATCH_DISCOVERY_READ_CONCURRENCY = 8;

export interface TranscriptionBatchCandidate {
	file: TFile;
	svgFileContent: string;
	pageData: InkFileData;
}

export interface TranscriptionBatchPlan {
	candidates: TranscriptionBatchCandidate[];
	/** Files of this type that already had a transcript and were skipped in `missing-only`. */
	alreadyTranscribedCount: number;
}

/** True when this ink file already carries a stored transcript. */
function hasStoredTranscript(pageData: InkFileData): boolean {
	return Boolean(pageData.meta.transcript?.trim());
}

/**
 * Finds the ink files of one type in the vault and reads them once.
 *
 * One pass serves both scopes: `missing-only` filters the result while `everything`
 * ignores transcripts, so the user's re-transcribe choice costs no extra vault reads.
 */
async function collectInkFilesOfType(
	plugin: InkPlugin,
	fileType: HandwritingTranscriptionFileType,
): Promise<TranscriptionBatchCandidate[]> {
	// Sniffing needs a read per file; the cheap file-type marker lets us skip most of
	// the vault before the expensive JSON parse in extractInkJsonFromSvg.
	const svgFiles = plugin.app.vault.getFiles().filter((file) => file.extension === 'svg');
	const candidates: TranscriptionBatchCandidate[] = [];
	let nextIndex = 0;

	const workerCount = Math.min(BATCH_DISCOVERY_READ_CONCURRENCY, Math.max(1, svgFiles.length));
	const workers = Array.from({ length: workerCount }, async () => {
		while (nextIndex < svgFiles.length) {
			const file = svgFiles[nextIndex];
			nextIndex += 1;
			try {
				const svgFileContent = await plugin.app.vault.cachedRead(file);
				if (sniffInkSvgFileType(svgFileContent) !== fileType) continue;
				const pageData = extractInkJsonFromSvg(svgFileContent);
				if (!pageData) continue;
				candidates.push({ file, svgFileContent, pageData });
			} catch {
				// Unreadable or non-ink SVGs are not batch candidates.
			}
		}
	});
	await Promise.all(workers);
	candidates.sort((left, right) => left.file.path.localeCompare(right.file.path));
	return candidates;
}

/**
 * Builds the ordered work list for a batch run of one file type.
 *
 * Every candidate is queued through the normal manual path, so a batch run pays the
 * same credits and obeys the same refusal rules as transcribing each file by hand.
 */
export async function planTranscriptionBatch(
	plugin: InkPlugin,
	fileType: HandwritingTranscriptionFileType,
	scope: TranscriptionBatchScope,
): Promise<TranscriptionBatchPlan> {
	const allCandidates = await collectInkFilesOfType(plugin, fileType);
	if (scope === 'everything') return { candidates: allCandidates, alreadyTranscribedCount: 0 };

	const candidates = allCandidates.filter((candidate) => !hasStoredTranscript(candidate.pageData));
	return {
		candidates,
		alreadyTranscribedCount: allCandidates.length - candidates.length,
	};
}

export interface RunTranscriptionBatchOptions {
	fileType: HandwritingTranscriptionFileType;
	scope: TranscriptionBatchScope;
	/** Called after each enqueue so a progress modal can count down. */
	onProgress?: (queuedCount: number, totalCount: number) => void;
}

/**
 * Queues a batch run onto the existing serial transcription worker.
 *
 * Enqueueing rather than transcribing inline keeps the plugin's single-worker guarantee:
 * a batch of fifty files cannot open fifty parallel portal jobs, and closing the modal
 * or the settings tab leaves the queue running as it already does for single jobs.
 */
export async function runTranscriptionBatch(
	plugin: InkPlugin,
	options: RunTranscriptionBatchOptions,
): Promise<{ queuedCount: number; alreadyTranscribedCount: number }> {
	const plan = await planTranscriptionBatch(plugin, options.fileType, options.scope);
	let queuedCount = 0;
	for (const candidate of plan.candidates) {
		await enqueueManualTranscription({
			file: candidate.file,
			fileType: options.fileType,
			svgFileContent: candidate.svgFileContent,
		});
		queuedCount += 1;
		options.onProgress?.(queuedCount, plan.candidates.length);
	}
	return { queuedCount, alreadyTranscribedCount: plan.alreadyTranscribedCount };
}
