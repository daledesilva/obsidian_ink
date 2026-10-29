import { Notice } from 'obsidian';
import InkPlugin from 'src/main';
import { openTranscriptionBatchModal } from 'src/components/dom-components/modals/transcription-batch-modal/transcription-batch-modal';
import { openWritingPhotoProgressModal } from 'src/components/dom-components/modals/writing-photo-progress-modal/writing-photo-progress-modal';
import {
	planTranscriptionBatch,
	runTranscriptionBatch,
} from 'src/logic/transcription-batch';
import type { HandwritingTranscriptionFileType } from 'src/logic/handwriting-transcription-queue-store';
import {
	hasLinkedAlmostUsefulAccount,
} from 'src/logic/almostuseful/almostuseful-session';

//////////
//////////

/**
 * Settings entry point for batch transcription: count, confirm the scope, then queue.
 *
 * Counting before the modal lets the user see how much of the vault is unread before
 * choosing, which matters because re-transcribing everything spends credits again.
 */
export async function beginTranscriptionBatchFromSettings(
	plugin: InkPlugin,
	fileType: HandwritingTranscriptionFileType,
): Promise<void> {
	if (!hasLinkedAlmostUsefulAccount()) {
		new Notice('Transcription requires an Almost Useful account. Link your account in Ink\'s settings.');
		return;
	}

	const plan = await planTranscriptionBatch(plugin, fileType, 'missing-only');
	const totalOfType = plan.candidates.length + plan.alreadyTranscribedCount;
	if (totalOfType === 0) {
		new Notice(`No ${fileType === 'inkWriting' ? 'writing' : 'drawings'} found in this vault`);
		return;
	}

	openTranscriptionBatchModal({
		plugin,
		fileType,
		pendingCount: plan.candidates.length,
		alreadyTranscribedCount: plan.alreadyTranscribedCount,
		onConfirm: (scope) => {
			void queueTranscriptionBatchWithProgress(plugin, fileType, scope);
		},
	});
}

/**
 * Runs the batch behind the existing progress modal so a long queue is cancellable.
 *
 * Cancel stops enqueueing further files but deliberately leaves already-queued work
 * running: those jobs are real portal requests the user has not been charged for yet,
 * and dropping them silently would lose the choice they already made.
 */
async function queueTranscriptionBatchWithProgress(
	plugin: InkPlugin,
	fileType: HandwritingTranscriptionFileType,
	scope: 'missing-only' | 'everything',
): Promise<void> {
	const typeLabel = fileType === 'inkWriting' ? 'writing' : 'drawings';
	let isCancelled = false;

	const progress = openWritingPhotoProgressModal({
		plugin,
		onCancel: () => {
			isCancelled = true;
		},
		title: `Transcribing all ${typeLabel}`,
		initialStage: `Finding ${typeLabel}…`,
	});

	try {
		const result = await runTranscriptionBatch(plugin, {
			fileType,
			scope,
			onProgress: (queuedCount, totalCount) => {
				progress.setStage(`Queued ${queuedCount} of ${totalCount}`, (queuedCount / totalCount) * 100);
			},
		});

		if (result.queuedCount === 0) {
			progress.setStage('Nothing needed a transcript.');
			new Notice(`Every ${typeLabel} file already has a transcript`);
			progress.close();
			return;
		}
		if (isCancelled) {
			progress.close();
			new Notice(`Queued ${result.queuedCount} ${typeLabel} files before cancelling`);
			return;
		}

		progress.setStage(`Queued ${result.queuedCount} files. Transcription continues in the background.`);
		progress.close();
		new Notice(`Queued ${result.queuedCount} ${typeLabel} files for transcription`);
	} catch (error) {
		progress.close();
		const message = error instanceof Error ? error.message : 'Could not start batch transcription';
		new Notice(message);
	}
}
