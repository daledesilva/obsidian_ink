import '../migration-modal/migration-modal.scss';
import { Modal, TFile } from 'obsidian';
import InkPlugin from 'src/main';
import {
	FileConversionResult,
	findNotesContainingFileEmbed,
	executeFileConversion,
} from 'src/logic/utils/convert-file-embeds';

////////
////////

const enum Phase {
	Scanning,
	Confirm,
	Converting,
	Done,
}

export type FileConversionModalOpts = {
	/** The markdown note the user is currently viewing (only set when triggered from an embed). */
	sourceMdFile?: TFile;
	/** Called immediately after SVG + notes are updated, before showing Done phase. Receives the file at its final path and the target type. */
	onConversionComplete?: (finalFile: TFile | null, toType: 'inkWriting' | 'inkDrawing') => void;
};

export class FileConversionModal extends Modal {
	private plugin: InkPlugin;
	private file: TFile;
	private toType: 'inkWriting' | 'inkDrawing';
	private sourceMdFile: TFile | undefined;
	private onConversionComplete: ((finalFile: TFile | null, toType: 'inkWriting' | 'inkDrawing') => void) | undefined;

	private phase: Phase = Phase.Scanning;
	private affectedNotes: TFile[] = [];
	private conversionResult: FileConversionResult | null = null;

	// Move option
	private suggestedMovePath: string | null = null;
	private moveCheckboxEl: HTMLInputElement | null = null;

	// DOM refs
	private progressBarInnerEl: HTMLElement | null = null;
	private statusTextEl: HTMLElement | null = null;
	private convertedCountEl: HTMLElement | null = null;
	private remainingCountEl: HTMLElement | null = null;
	private failedCountEl: HTMLElement | null = null;

	constructor(
		plugin: InkPlugin,
		file: TFile,
		toType: 'inkWriting' | 'inkDrawing',
		opts?: FileConversionModalOpts,
	) {
		super(plugin.app);
		this.plugin = plugin;
		this.file = file;
		this.toType = toType;
		this.sourceMdFile = opts?.sourceMdFile;
		this.onConversionComplete = opts?.onConversionComplete;
	}

	onOpen() {
		const label = this.toType === 'inkDrawing' ? 'Drawing' : 'Writing';
		this.titleEl.setText(`Convert to ${label}`);
		this.contentEl.addClass('ddc_ink_migration-modal');
		this.computeSuggestedMovePath();
		this.renderScanPhase();
	}

	onClose() {
		this.contentEl.empty();
	}

	// ─── Move path helper ─────────────────────────────────────────────────────

	private computeSuggestedMovePath() {
		const { writingSubfolder, drawingSubfolder } = this.plugin.settings;
		const parentPath = this.file.parent?.path ?? '';

		if (this.toType === 'inkDrawing' && parentPath === writingSubfolder) {
			this.suggestedMovePath = `${drawingSubfolder}/${this.file.name}`;
		} else if (this.toType === 'inkWriting' && parentPath === drawingSubfolder) {
			this.suggestedMovePath = `${writingSubfolder}/${this.file.name}`;
		} else {
			this.suggestedMovePath = null;
		}
	}

	// ─── Phase 1: Scan ────────────────────────────────────────────────────────

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
		this.convertedCountEl = this.createStat(statsEl, '0', 'found').countEl;

		this.runScan();
	}

	private async runScan() {
		const fromType = this.toType === 'inkDrawing' ? 'inkWriting' : 'inkDrawing';

		try {
			this.affectedNotes = await findNotesContainingFileEmbed(
				this.plugin.app.vault,
				this.file.path,
				fromType,
				(scanned, total) => {
					const remaining = total - scanned;
					const pct = total > 0 ? (scanned / total) * 100 : 100;
					if (this.progressBarInnerEl) this.progressBarInnerEl.style.width = pct.toFixed(1) + '%';
					if (this.remainingCountEl) this.remainingCountEl.setText(String(remaining));
					if (this.convertedCountEl) this.convertedCountEl.setText(String(this.affectedNotes.length));
				},
			);
		} catch (err) {
			if (this.statusTextEl) this.statusTextEl.setText('Scan failed: ' + String(err));
			return;
		}

		this.renderConfirmPhase();
	}

	// ─── Phase 2: Confirm ─────────────────────────────────────────────────────

	private renderConfirmPhase() {
		this.phase = Phase.Confirm;
		const { contentEl } = this;
		contentEl.empty();

		const typeLabel = this.toType === 'inkDrawing' ? 'drawing' : 'writing';

		// Determine which notes to show and what messaging to use
		const otherNotes = this.sourceMdFile
			? this.affectedNotes.filter(n => n.path !== this.sourceMdFile!.path)
			: this.affectedNotes;

		const notesCount = otherNotes.length;
		const fromFullPage = !this.sourceMdFile;

		if (notesCount > 0) {
			const heading = fromFullPage
				? `These notes embed this file:`
				: `These other notes also embed this file:`;
			this.renderList(contentEl, heading, otherNotes.map(n => n.path));

			contentEl.createEl('p', {
				text: `Are you sure you want to convert it to ${typeLabel}? This will update all notes that embed it.`,
			});
		}

		// Move checkbox (only when file is in the expected subfolder)
		if (this.suggestedMovePath) {
			const destFolder = this.toType === 'inkDrawing'
				? this.plugin.settings.drawingSubfolder
				: this.plugin.settings.writingSubfolder;
			const moveOptionEl = contentEl.createDiv({ cls: 'ddc_ink_migration-move-option' });
			this.moveCheckboxEl = moveOptionEl.createEl('input', { type: 'checkbox' });
			this.moveCheckboxEl.checked = true;
			this.moveCheckboxEl.id = 'ddc_ink_move-checkbox';
			const labelEl = moveOptionEl.createEl('label');
			labelEl.setAttribute('for', 'ddc_ink_move-checkbox');
			labelEl.setText(`Also move file to ${destFolder}`);
		}

		const buttonsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-buttons' });
		const cancelBtn = buttonsEl.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const convertBtn = buttonsEl.createEl('button', { cls: 'mod-cta', text: 'Convert' });
		convertBtn.addEventListener('click', () => this.renderConvertingPhase());
	}

	private renderList(parent: HTMLElement, title: string, items: string[]) {
		const sectionEl = parent.createDiv({ cls: 'ddc_ink_migration-section' });
		sectionEl.createDiv({ cls: 'ddc_ink_migration-section-title', text: title });
		const listEl = sectionEl.createDiv({ cls: 'ddc_ink_migration-list' });

		if (items.length === 0) {
			listEl.createDiv({ cls: 'ddc_ink_migration-list-empty', text: 'None' });
		} else {
			for (const item of items) {
				listEl.createDiv({ cls: 'ddc_ink_migration-list-item', text: item });
			}
		}
	}

	// ─── Phase 3: Converting ──────────────────────────────────────────────────

	private renderConvertingPhase() {
		this.phase = Phase.Converting;
		const { contentEl } = this;
		contentEl.empty();

		this.statusTextEl = contentEl.createDiv({
			cls: 'ddc_ink_migration-status-text',
			text: 'Converting…',
		});

		const progressBarEl = contentEl.createDiv({ cls: 'ddc_ink_migration-progress-bar' });
		this.progressBarInnerEl = progressBarEl.createDiv({ cls: 'ddc_ink_migration-progress-bar-inner' });

		const statsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-stats' });
		this.convertedCountEl = this.createStat(statsEl, '0', 'updated').countEl;
		this.remainingCountEl = this.createStat(statsEl, String(this.affectedNotes.length), 'remaining').countEl;
		this.failedCountEl = this.createStat(statsEl, '0', 'failed').countEl;

		this.runConversion();
	}

	private async runConversion() {
		const moveToPath = (this.moveCheckboxEl?.checked && this.suggestedMovePath)
			? this.suggestedMovePath
			: null;

		try {
			this.conversionResult = await executeFileConversion(
				this.plugin,
				this.file,
				this.toType,
				this.affectedNotes,
				moveToPath,
				(done, total) => {
					const pct = total > 0 ? (done / total) * 100 : 100;
					if (this.progressBarInnerEl) this.progressBarInnerEl.style.width = pct.toFixed(1) + '%';
					if (this.remainingCountEl && this.conversionResult) {
						this.remainingCountEl.setText(String(total - done));
						this.convertedCountEl?.setText(String(this.conversionResult.updatedNotePaths.length));
						this.failedCountEl?.setText(String(this.conversionResult.failed.length));
					}
				},
			);
		} catch (err) {
			if (this.statusTextEl) this.statusTextEl.setText('Conversion failed: ' + String(err));
			return;
		}

		this.onConversionComplete?.(this.conversionResult?.finalFile ?? null, this.toType);
		this.renderDonePhase();
	}

	// ─── Phase 4: Done ────────────────────────────────────────────────────────

	private renderDonePhase() {
		this.phase = Phase.Done;
		const { contentEl } = this;
		const result = this.conversionResult!;
		contentEl.empty();

		const typeLabel = this.toType === 'inkDrawing' ? 'drawing' : 'writing';
		const noteCount = result.updatedNotePaths.length;
		contentEl.createEl('p', {
			text: `Converted to ${typeLabel}. ${noteCount} note${noteCount !== 1 ? 's' : ''} updated.`,
		});

		if (result.failed.length > 0) {
			this.renderList(contentEl, `Failed (${result.failed.length})`, result.failed);
		}

		const buttonsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-buttons' });

		if (result.updatedNotePaths.length > 10) {
			const randomBtn = buttonsEl.createEl('button', { text: 'Open 10 random notes' });
			randomBtn.addEventListener('click', () => {
				const shuffled = [...result.updatedNotePaths].sort(() => Math.random() - 0.5);
				for (const path of shuffled.slice(0, 10)) {
					this.plugin.app.workspace.openLinkText(path, '', true);
				}
			});
		}

		if (result.updatedNotePaths.length > 0) {
			const openAllBtn = buttonsEl.createEl('button', {
				text: `Open all ${result.updatedNotePaths.length} note${result.updatedNotePaths.length !== 1 ? 's' : ''}`,
			});
			openAllBtn.addEventListener('click', () => {
				for (const path of result.updatedNotePaths) {
					this.plugin.app.workspace.openLinkText(path, '', true);
				}
			});
		}

		const doneBtn = buttonsEl.createEl('button', { cls: 'mod-cta', text: 'Done' });
		doneBtn.addEventListener('click', () => this.close());
	}

	// ─── Helpers ──────────────────────────────────────────────────────────────

	private createStat(parent: HTMLElement, count: string, label: string): { countEl: HTMLElement } {
		const statEl = parent.createDiv({ cls: 'ddc_ink_migration-stat' });
		const countEl = statEl.createDiv({ cls: 'ddc_ink_migration-stat-count', text: count });
		statEl.createDiv({ cls: 'ddc_ink_migration-stat-name', text: label });
		return { countEl };
	}
}
