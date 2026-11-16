import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { hasLinkedAlmostUsefulAccount } from 'src/logic/almostuseful/almostuseful-session';
import { openTranscriptionBatchModal } from 'src/components/dom-components/modals/transcription-batch-modal/transcription-batch-modal';
import { openWritingPhotoProgressModal } from 'src/components/dom-components/modals/writing-photo-progress-modal/writing-photo-progress-modal';
import { planTranscriptionBatch, runTranscriptionBatch } from 'src/logic/transcription-batch';
import { beginTranscriptionBatchFromSettings } from 'src/logic/transcription-batch-settings-entry';

const noticeMessages: string[] = [];

jest.mock('obsidian', () => {
	const actual = jest.requireActual('../__mocks__/obsidianMock.js') as Record<string, unknown>;
	return {
		...actual,
		Notice: class {
			constructor(message: string) {
				noticeMessages.push(message);
			}
		},
	};
});

jest.mock('src/logic/almostuseful/almostuseful-session', () => ({
	hasLinkedAlmostUsefulAccount: jest.fn(),
}));

jest.mock('src/logic/transcription-batch', () => ({
	planTranscriptionBatch: jest.fn(),
	runTranscriptionBatch: jest.fn(),
}));

jest.mock('src/components/dom-components/modals/transcription-batch-modal/transcription-batch-modal', () => ({
	openTranscriptionBatchModal: jest.fn(),
}));

jest.mock('src/components/dom-components/modals/writing-photo-progress-modal/writing-photo-progress-modal', () => ({
	openWritingPhotoProgressModal: jest.fn(),
}));

const signedIn = jest.mocked(hasLinkedAlmostUsefulAccount);
const plan = jest.mocked(planTranscriptionBatch);
const run = jest.mocked(runTranscriptionBatch);
const openModal = jest.mocked(openTranscriptionBatchModal);
const openProgress = jest.mocked(openWritingPhotoProgressModal);

const plugin = {} as any;
let cancelBatch: (() => void) | null = null;
const progress = {
	setStage: jest.fn(),
	close: jest.fn(),
};

async function flush(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('beginTranscriptionBatchFromSettings', () => {
	beforeEach(() => {
		noticeMessages.length = 0;
		cancelBatch = null;
		progress.setStage.mockClear();
		progress.close.mockClear();
		signedIn.mockReset();
		plan.mockReset();
		run.mockReset();
		openModal.mockReset();
		openProgress.mockReset();
		openProgress.mockImplementation((options) => {
			cancelBatch = options.onCancel;
			return progress;
		});
	});

	test('asks for an account when signed out', async () => {
		signedIn.mockReturnValue(false);
		await beginTranscriptionBatchFromSettings(plugin, 'inkWriting');
		expect(noticeMessages).toEqual([
			'Transcription requires an Almost Useful account. Link your account in Ink\'s settings.',
		]);
		expect(openModal).not.toHaveBeenCalled();
	});

	test('says when the vault has no files of that type', async () => {
		signedIn.mockReturnValue(true);
		plan.mockResolvedValue({ candidates: [], alreadyTranscribedCount: 0 });
		await beginTranscriptionBatchFromSettings(plugin, 'inkDrawing');
		expect(noticeMessages).toEqual(['No drawings found in this vault']);
		expect(openModal).not.toHaveBeenCalled();
	});

	test('opens the scope modal with the missing-only counts', async () => {
		signedIn.mockReturnValue(true);
		plan.mockResolvedValue({ candidates: [{} as any], alreadyTranscribedCount: 3 });
		await beginTranscriptionBatchFromSettings(plugin, 'inkWriting');
		expect(openModal).toHaveBeenCalledWith(expect.objectContaining({
			fileType: 'inkWriting',
			pendingCount: 1,
			alreadyTranscribedCount: 3,
		}));
	});

	test('queues the chosen scope and says transcription continues', async () => {
		signedIn.mockReturnValue(true);
		plan.mockResolvedValue({ candidates: [{} as any, {} as any], alreadyTranscribedCount: 0 });
		run.mockImplementation(async (_plugin, options) => {
			options.onProgress?.(1, 2);
			options.onProgress?.(2, 2);
			return { queuedCount: 2, alreadyTranscribedCount: 0 };
		});
		await beginTranscriptionBatchFromSettings(plugin, 'inkWriting');
		const onConfirm = openModal.mock.calls[0][0].onConfirm;
		onConfirm('everything');
		await flush();

		expect(run).toHaveBeenCalledWith(plugin, expect.objectContaining({
			fileType: 'inkWriting',
			scope: 'everything',
		}));
		expect(progress.setStage).toHaveBeenCalledWith('Queued 1 of 2', 50);
		expect(progress.setStage).toHaveBeenCalledWith(
			'Queued 2 files. Transcription continues in the background.',
		);
		expect(noticeMessages).toEqual(['Queued 2 writing files for transcription']);
		expect(progress.close).toHaveBeenCalled();
	});

	test('cancel does not stop enqueueing and changes the closing notice', async () => {
		signedIn.mockReturnValue(true);
		plan.mockResolvedValue({ candidates: [{} as any], alreadyTranscribedCount: 1 });
		run.mockImplementation(async () => {
			cancelBatch?.();
			return { queuedCount: 1, alreadyTranscribedCount: 1 };
		});
		await beginTranscriptionBatchFromSettings(plugin, 'inkWriting');
		openModal.mock.calls[0][0].onConfirm('missing-only');
		await flush();

		expect(noticeMessages).toEqual(['Queued 1 writing files before cancelling']);
		expect(progress.close).toHaveBeenCalled();
	});

	test('says when every file already has a transcript', async () => {
		signedIn.mockReturnValue(true);
		plan.mockResolvedValue({ candidates: [{} as any], alreadyTranscribedCount: 1 });
		run.mockResolvedValue({ queuedCount: 0, alreadyTranscribedCount: 1 });
		await beginTranscriptionBatchFromSettings(plugin, 'inkWriting');
		openModal.mock.calls[0][0].onConfirm('missing-only');
		await flush();

		expect(noticeMessages).toEqual(['Every writing file already has a transcript']);
		expect(progress.setStage).toHaveBeenCalledWith('Nothing needed a transcript.');
	});
});
