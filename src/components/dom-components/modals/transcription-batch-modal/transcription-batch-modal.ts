import { Modal } from 'obsidian';
import InkPlugin from 'src/main';
import type { TranscriptionBatchScope } from 'src/logic/transcription-batch';
import './transcription-batch-modal.scss';

//////////
//////////

export interface OpenTranscriptionBatchModalOptions {
	plugin: InkPlugin;
	fileType: 'inkWriting' | 'inkDrawing';
	/** Files already carrying a transcript, shown so the user can judge the two options. */
	alreadyTranscribedCount: number;
	pendingCount: number;
	onConfirm: (scope: TranscriptionBatchScope) => void;
}

/**
 * Asks whether to fill in only missing transcripts or to rewrite every file's transcript.
 *
 * The choice has to be explicit because re-transcribing spends credits again on files the
 * user already paid to read, and there is no undo for the credits.
 */
export function openTranscriptionBatchModal(options: OpenTranscriptionBatchModalOptions): void {
	const modal = new TranscriptionBatchModal(options);
	modal.open();
}

class TranscriptionBatchModal extends Modal {
	private readonly options: OpenTranscriptionBatchModalOptions;

	constructor(options: OpenTranscriptionBatchModalOptions) {
		super(options.plugin.app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl, modalEl, titleEl } = this;
		modalEl.addClass('ddc_ink_modal');
		modalEl.addClass('ddc_ink_transcription-batch-modal');

		const typeLabel = this.options.fileType === 'inkWriting' ? 'writing' : 'drawings';
		titleEl.setText(`Transcribe all ${typeLabel}`);

		contentEl.createEl('p', {
			text: `${this.options.pendingCount} ${typeLabel} ${this.options.pendingCount === 1 ? 'has' : 'have'} no transcript yet. ${this.options.alreadyTranscribedCount} already ${this.options.alreadyTranscribedCount === 1 ? 'has' : 'have'} one.`,
		});
		contentEl.createEl('p', {
			text: 'Each file uses AI credits. Re-transcribing replaces existing transcripts and spends credits again.',
		});

		const actionsEl = contentEl.createDiv('ddc_ink_transcription-batch-modal__actions');

		const missingOnlyButtonEl = actionsEl.createEl('button', {
			cls: 'ddc_ink_primary-btn',
			text: 'Transcribe missing only',
			type: 'button',
		});
		missingOnlyButtonEl.addEventListener('click', () => {
			this.confirm('missing-only');
		});
		// Nothing to do when every file is already transcribed.
		if (this.options.pendingCount === 0) missingOnlyButtonEl.disabled = true;

		const everythingButtonEl = actionsEl.createEl('button', {
			cls: 'ddc_ink_tertiary-btn',
			text: 'Re-transcribe everything',
			type: 'button',
		});
		everythingButtonEl.addEventListener('click', () => {
			this.confirm('everything');
		});

		const cancelButtonEl = actionsEl.createEl('button', {
			cls: 'ddc_ink_tertiary-btn',
			text: 'Cancel',
			type: 'button',
		});
		cancelButtonEl.addEventListener('click', () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private confirm(scope: TranscriptionBatchScope): void {
		this.close();
		this.options.onConfirm(scope);
	}
}
