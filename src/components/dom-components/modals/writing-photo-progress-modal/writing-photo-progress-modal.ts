import { Modal } from 'obsidian';
import InkPlugin from 'src/main';
import './writing-photo-progress-modal.scss';

////////
////////

export interface WritingPhotoProgressHandle {
	setStage: (stage: string, percent?: number) => void;
	close: () => void;
}

/**
 * Stays open while warp, local trace, or the Almost Useful job runs.
 * Stages append as a log so a portal error stays visible after local fallback.
 * Cancel writes nothing. Determinate bar only when the worker posts a percent.
 */
export function openWritingPhotoProgressModal(
	plugin: InkPlugin,
	onCancel: () => void,
): WritingPhotoProgressHandle {
	const modal = new WritingPhotoProgressModal(plugin, onCancel);
	modal.open();
	return {
		setStage: (stage, percent) => modal.setStage(stage, percent),
		close: () => modal.finish(),
	};
}

class WritingPhotoProgressModal extends Modal {
	private onCancel: () => void;
	private settled = false;
	private logEl: HTMLElement | null = null;
	private barEl: HTMLElement | null = null;
	private barFillEl: HTMLElement | null = null;
	/** Avoids duplicate log lines when the worker repeats the same stage label. */
	private lastLoggedStage: string | null = null;

	constructor(plugin: InkPlugin, onCancel: () => void) {
		super(plugin.app);
		this.onCancel = onCancel;
	}

	onOpen(): void {
		const { titleEl, contentEl, modalEl } = this;
		modalEl.addClass('ddc_ink_photo-progress-modal');
		titleEl.setText('Converting handwriting');
		this.logEl = contentEl.createDiv({ cls: 'ddc_ink_photo-progress__log' });
		this.appendLogLine('Starting…');
		this.barEl = contentEl.createDiv({ cls: 'ddc_ink_photo-progress__bar is-indeterminate' });
		this.barFillEl = this.barEl.createDiv({ cls: 'ddc_ink_photo-progress__fill' });
		const actions = contentEl.createDiv({ cls: 'ddc_ink_photo-progress__actions' });
		const cancel = actions.createEl('button', { text: 'Cancel' });
		cancel.addEventListener('click', () => this.cancel());
	}

	setStage(stage: string, percent?: number): void {
		if (stage !== this.lastLoggedStage) {
			this.appendLogLine(stage);
		}
		if (!this.barEl || !this.barFillEl) return;
		if (percent == null || !Number.isFinite(percent)) {
			this.barEl.addClass('is-indeterminate');
			this.barFillEl.style.width = '';
			return;
		}
		this.barEl.removeClass('is-indeterminate');
		this.barFillEl.style.width = `${Math.min(100, Math.max(0, percent))}%`;
	}

	finish(): void {
		if (this.settled) return;
		this.settled = true;
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.settled) {
			this.settled = true;
			this.onCancel();
		}
	}

	private appendLogLine(stage: string): void {
		if (!this.logEl) return;
		this.lastLoggedStage = stage;
		const lineEl = this.logEl.createEl('div', {
			text: stage,
			cls: 'ddc_ink_photo-progress__log-line',
		});
		lineEl.scrollIntoView({ block: 'nearest' });
	}

	private cancel(): void {
		if (this.settled) return;
		this.settled = true;
		this.onCancel();
		this.close();
	}
}
