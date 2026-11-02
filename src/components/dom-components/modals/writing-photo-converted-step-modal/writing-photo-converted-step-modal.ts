import { Modal, Setting } from 'obsidian';
import InkPlugin from 'src/main';
import { setPhotoTraceChevronLabel } from 'src/components/dom-components/modals/photo-trace-chevron-button';
import type { InkPhotoConvertTarget } from 'src/logic/photo-trace/photo-convert-target';
import './writing-photo-converted-step-modal.scss';

//////////
//////////

export type WritingPhotoConvertedStepChoice =
	| { action: 'previous' }
	| { action: 'photos' }
	| { action: 'next' }
	| { action: 'convert-all' }
	| { action: 'cancel' };

export interface OpenWritingPhotoConvertedStepOptions {
	plugin: InkPlugin;
	/** What this photo was already converted into. */
	target: InkPhotoConvertTarget;
	/** Centred count above the note, such as "2 of 5 photos". */
	positionLabel?: string;
	/** True when there is an earlier photo to step to. */
	canGoPrevious?: boolean;
	/** True when there is a later photo to step to. */
	canGoNext?: boolean;
	onChoice: (choice: WritingPhotoConvertedStepChoice) => void;
}

/**
 * Shown when the queue walks into a photo that is already in the note. It is read-only
 * on purpose: re-running the trace would insert the same page twice.
 *
 * The footer matches the page step, so walking through a batch keeps Thumbnails, the
 * image steps, and Convert all in the same places even when a photo is already done.
 */
export function openWritingPhotoConvertedStep(options: OpenWritingPhotoConvertedStepOptions): void {
	const modal = new WritingPhotoConvertedStepModal(options);
	modal.open();
}

class WritingPhotoConvertedStepModal extends Modal {
	private readonly options: OpenWritingPhotoConvertedStepOptions;
	private settled = false;

	constructor(options: OpenWritingPhotoConvertedStepOptions) {
		super(options.plugin.app);
		this.options = options;
	}

	onOpen(): void {
		const { titleEl, contentEl, modalEl } = this;
		modalEl.addClass('ddc_ink_photo-converted-step-modal');
		modalEl.addClass('ddc_ink_modal');
		titleEl.setText('Already converted');
		if (this.options.positionLabel) {
			contentEl.createDiv({
				text: this.options.positionLabel,
				cls: 'ddc_ink_photo-converted__count',
			});
		}

		const targetLabel = this.options.target === 'drawing' ? 'drawing' : 'handwriting';
		contentEl.createEl('p', {
			text: `This photo was already converted to ${targetLabel} and added to your note.`,
			cls: 'ddc_ink_photo-converted__note',
		});

		const canGoPrevious = this.options.canGoPrevious ?? false;
		const footerRow = new Setting(contentEl);
		footerRow.settingEl.addClass('ddc_ink_photo-converted__footer');
		footerRow.addButton((button) => {
			button.buttonEl.addClass('ddc_ink_photo-converted__thumbnails-btn');
			setPhotoTraceChevronLabel(button.buttonEl, 'Thumbnails', 'start');
			button.onClick(() => this.finish({ action: 'photos' }));
		});
		footerRow.addButton((button) => {
			setPhotoTraceChevronLabel(button.buttonEl, 'Prev image', 'start');
			// The first photo has nothing earlier. The label stays put so Thumbnails
			// remains the only way back to the grid.
			button.setDisabled(!canGoPrevious);
			button.onClick(() => this.finish({ action: 'previous' }));
		});
		footerRow.addButton((button) => {
			setPhotoTraceChevronLabel(button.buttonEl, 'Next image', 'end');
			button.setDisabled(!this.options.canGoNext);
			button.onClick(() => this.finish({ action: 'next' }));
		});
		footerRow.addButton((button) => {
			button.buttonEl.addClass('ddc_ink_photo-converted__convert-all-btn');
			// This photo is already in the note, so Convert all only handles the rest.
			button.setButtonText('Convert all');
			button.setCta();
			button.onClick(() => this.finish({ action: 'convert-all' }));
		});
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.settled) this.options.onChoice({ action: 'cancel' });
		this.settled = true;
	}

	private finish(choice: WritingPhotoConvertedStepChoice): void {
		if (this.settled) return;
		this.settled = true;
		this.close();
		this.options.onChoice(choice);
	}
}
