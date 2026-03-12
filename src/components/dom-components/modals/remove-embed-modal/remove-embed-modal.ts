import '../migration-modal/migration-modal.scss';
import { Modal, TFile } from 'obsidian';
import InkPlugin from 'src/main';
import { findNotesContainingFileEmbed } from 'src/logic/utils/convert-file-embeds';

////////
////////

const enum Phase {
	Scanning,
	Confirm,
}

export type RemoveEmbedModalOpts = {
	/** The markdown note containing the embed. */
	sourceMdFile: TFile;
	/** Called when user chooses "Remove embed" only. */
	onRemoveEmbedOnly: () => void;
	/** Called when user chooses "Remove and delete file". */
	onRemoveEmbedAndFile: () => void;
};

export class RemoveEmbedModal extends Modal {
	private plugin: InkPlugin;
	private embeddedFile: TFile;
	private embedType: 'inkWriting' | 'inkDrawing';
	private opts: RemoveEmbedModalOpts;

	private phase: Phase = Phase.Scanning;
	private affectedNotes: TFile[] = [];

	private progressBarInnerEl: HTMLElement | null = null;
	private statusTextEl: HTMLElement | null = null;
	private remainingCountEl: HTMLElement | null = null;
	private foundCountEl: HTMLElement | null = null;

	constructor(
		plugin: InkPlugin,
		embeddedFile: TFile,
		embedType: 'inkWriting' | 'inkDrawing',
		opts: RemoveEmbedModalOpts,
	) {
		super(plugin.app);
		this.plugin = plugin;
		this.embeddedFile = embeddedFile;
		this.embedType = embedType;
		this.opts = opts;
	}

	onOpen() {
		this.titleEl.setText('Remove embed');
		this.contentEl.addClass('ddc_ink_migration-modal');
		this.renderScanPhase();
	}

	onClose() {
		this.contentEl.empty();
	}

	private renderScanPhase() {
		this.phase = Phase.Scanning;
		const { contentEl } = this;
		contentEl.empty();

		this.statusTextEl = contentEl.createDiv({
			cls: 'ddc_ink_migration-status-text',
			text: 'Scanning vault for notes that embed this file…',
		});

		const progressBarEl = contentEl.createDiv({ cls: 'ddc_ink_migration-progress-bar' });
		this.progressBarInnerEl = progressBarEl.createDiv({ cls: 'ddc_ink_migration-progress-bar-inner' });

		const statsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-stats' });
		this.remainingCountEl = this.createStat(statsEl, '0', 'remaining').countEl;
		this.foundCountEl = this.createStat(statsEl, '0', 'found').countEl;

		this.runScan();
	}

	private async runScan() {
		try {
			this.affectedNotes = await findNotesContainingFileEmbed(
				this.plugin.app.vault,
				this.embeddedFile.path,
				this.embedType,
				(scanned, total) => {
					const remaining = total - scanned;
					const pct = total > 0 ? (scanned / total) * 100 : 100;
					if (this.progressBarInnerEl) this.progressBarInnerEl.style.width = pct.toFixed(1) + '%';
					if (this.remainingCountEl) this.remainingCountEl.setText(String(remaining));
					if (this.foundCountEl) this.foundCountEl.setText(String(this.affectedNotes.length));
				},
			);
		} catch (err) {
			if (this.statusTextEl) this.statusTextEl.setText('Scan failed: ' + String(err));
			return;
		}

		const isOnlyInCurrentNote = this.affectedNotes.length === 1;

		if (isOnlyInCurrentNote) {
			this.renderConfirmPhase();
		} else {
			// File is embedded elsewhere; remove embed only without prompting
			this.opts.onRemoveEmbedOnly();
			this.close();
		}
	}

	private renderConfirmPhase() {
		this.phase = Phase.Confirm;
		const { contentEl } = this;
		contentEl.empty();

		const typeLabel = this.embedType === 'inkDrawing' ? 'drawing' : 'writing';
		contentEl.createEl('p', {
			text: `This ${typeLabel} file is only embedded in this note. Do you want to remove the embed only, or also delete the file from your vault?`,
		});

		const buttonsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-buttons' });

		const cancelBtn = buttonsEl.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const removeAndDeleteBtn = buttonsEl.createEl('button', { cls: 'mod-warning', text: 'Remove and delete file' });
		removeAndDeleteBtn.setAttr('aria-label', 'Remove and permanently delete file');
		removeAndDeleteBtn.addEventListener('click', () => {
			this.opts.onRemoveEmbedAndFile();
			this.close();
		});

		const removeOnlyBtn = buttonsEl.createEl('button', { cls: 'mod-cta', text: 'Remove embed' });
		removeOnlyBtn.addEventListener('click', () => {
			this.opts.onRemoveEmbedOnly();
			this.close();
		});
	}

	private createStat(parent: HTMLElement, count: string, label: string): { countEl: HTMLElement } {
		const statEl = parent.createDiv({ cls: 'ddc_ink_migration-stat' });
		const countEl = statEl.createDiv({ cls: 'ddc_ink_migration-stat-count', text: count });
		statEl.createDiv({ cls: 'ddc_ink_migration-stat-name', text: label });
		return { countEl };
	}
}
