import './migration-modal.scss';
import { Modal } from 'obsidian';
import InkPlugin from 'src/main';
import {
	VaultScanResult,
	MigrationResult,
	scanVaultForLegacyEmbeds,
	executeMigration,
} from 'src/logic/utils/migration-logic';

////////
////////

const enum Phase {
	Scanning,
	Confirm,
	Migrating,
	Done,
}

export class MigrationModal extends Modal {
	private plugin: InkPlugin;
	private phase: Phase = Phase.Scanning;
	private scanResult: VaultScanResult | null = null;
	private migrationResult: MigrationResult | null = null;

	// DOM refs
	private progressBarInnerEl: HTMLElement | null = null;
	private statusTextEl: HTMLElement | null = null;
	private convertedCountEl: HTMLElement | null = null;
	private remainingCountEl: HTMLElement | null = null;
	private skippedCountEl: HTMLElement | null = null;
	private failedCountEl: HTMLElement | null = null;
	private logEl: HTMLElement | null = null;

	constructor(plugin: InkPlugin) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onOpen() {
		this.titleEl.setText('Migrate Legacy Ink Embeds');
		this.contentEl.addClass('ddc_ink_migration-modal');
		this.renderScanPhase();
	}

	onClose() {
		this.contentEl.empty();
	}

	// ─── Phase 1: Scan ───────────────────────────────────────────────────────

	private renderScanPhase() {
		this.phase = Phase.Scanning;
		const { contentEl } = this;
		contentEl.empty();

		this.statusTextEl = contentEl.createDiv({ cls: 'ddc_ink_migration-status-text', text: 'Scanning vault for legacy embeds…' });

		const progressBarEl = contentEl.createDiv({ cls: 'ddc_ink_migration-progress-bar' });
		this.progressBarInnerEl = progressBarEl.createDiv({ cls: 'ddc_ink_migration-progress-bar-inner' });

		const statsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-stats' });
		this.remainingCountEl = this.createStat(statsEl, '0', 'remaining').countEl;
		this.convertedCountEl = this.createStat(statsEl, '0', 'found').countEl;

		// Start scanning asynchronously
		this.runScan();
	}

	private async runScan() {
		const total = this.plugin.app.vault.getMarkdownFiles().length;

		try {
			this.scanResult = await scanVaultForLegacyEmbeds(
				this.plugin.app.vault,
				(scanned, tot) => {
					const remaining = tot - scanned;
					const pct = tot > 0 ? (scanned / tot) * 100 : 100;
					if (this.progressBarInnerEl) {
						this.progressBarInnerEl.style.width = pct.toFixed(1) + '%';
					}
					if (this.remainingCountEl) this.remainingCountEl.setText(String(remaining));
					if (this.convertedCountEl) this.convertedCountEl.setText(String(this.scanResult?.legacyFiles.length ?? 0));
				},
			);
		} catch (err) {
			if (this.statusTextEl) this.statusTextEl.setText('Scan failed: ' + String(err));
			return;
		}

		if (this.scanResult.legacyFiles.length === 0) {
			this.renderNothingToMigrate();
		} else {
			this.renderConfirmPhase();
		}
	}

	// ─── No legacy embeds found ───────────────────────────────────────────────

	private renderNothingToMigrate() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('p', { text: 'No legacy ink embeds were found in your vault. Nothing to migrate.' });

		const buttonsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-buttons' });
		const doneBtn = buttonsEl.createEl('button', { cls: 'mod-cta', text: 'Done' });
		doneBtn.addEventListener('click', () => this.close());
	}

	// ─── Phase 2: Confirm ─────────────────────────────────────────────────────

	private renderConfirmPhase() {
		this.phase = Phase.Confirm;
		const { contentEl } = this;
		const scan = this.scanResult!;
		contentEl.empty();

		contentEl.createEl('p', {
			text: `Found ${scan.legacyFiles.length} legacy embed file${scan.legacyFiles.length !== 1 ? 's' : ''} and ${scan.affectedNotes.length} note${scan.affectedNotes.length !== 1 ? 's' : ''} to update. Review below and confirm.`,
		});

		// List: embeds to convert
		this.renderList(
			contentEl,
			`Embeds that will be converted (${scan.legacyFiles.length})`,
			scan.legacyFiles.map(e => e.legacyFile.path),
		);

		// List: notes to update
		this.renderList(
			contentEl,
			`Notes that will have their links updated (${scan.affectedNotes.length})`,
			scan.affectedNotes.map(n => n.path),
		);

		const buttonsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-buttons' });
		const cancelBtn = buttonsEl.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const migrateBtn = buttonsEl.createEl('button', { cls: 'mod-cta', text: 'Migrate' });
		migrateBtn.addEventListener('click', () => this.renderMigratingPhase());
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

	// ─── Phase 3: Migrate ─────────────────────────────────────────────────────

	private renderMigratingPhase() {
		this.phase = Phase.Migrating;
		const { contentEl } = this;
		contentEl.empty();

		this.statusTextEl = contentEl.createDiv({ cls: 'ddc_ink_migration-status-text', text: 'Migrating…' });

		const progressBarEl = contentEl.createDiv({ cls: 'ddc_ink_migration-progress-bar' });
		this.progressBarInnerEl = progressBarEl.createDiv({ cls: 'ddc_ink_migration-progress-bar-inner' });

		const statsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-stats' });
		this.convertedCountEl = this.createStat(statsEl, '0', 'converted').countEl;
		this.remainingCountEl = this.createStat(statsEl, String(this.scanResult!.legacyFiles.length + this.scanResult!.affectedNotes.length), 'remaining').countEl;
		this.skippedCountEl = this.createStat(statsEl, '0', 'skipped').countEl;
		this.failedCountEl = this.createStat(statsEl, '0', 'failed').countEl;

		this.logEl = contentEl.createDiv({ cls: 'ddc_ink_migration-log' });
		this.logEl.hide();

		this.runMigration();
	}

	private async runMigration() {
		const scan = this.scanResult!;
		const total = scan.legacyFiles.length + scan.affectedNotes.length;
		let done = 0;

		try {
			this.migrationResult = await executeMigration(
				this.plugin.app.vault,
				scan,
				(d, tot) => {
					done = d;
					const pct = tot > 0 ? (d / tot) * 100 : 100;
					if (this.progressBarInnerEl) this.progressBarInnerEl.style.width = pct.toFixed(1) + '%';
					if (this.remainingCountEl) this.remainingCountEl.setText(String(tot - d));

					if (this.migrationResult) {
						if (this.convertedCountEl) this.convertedCountEl.setText(String(this.migrationResult.convertedFiles));
						if (this.skippedCountEl) this.skippedCountEl.setText(String(this.migrationResult.skipped.length));
						if (this.failedCountEl) this.failedCountEl.setText(String(this.migrationResult.failed.length));
					}
				},
			);
		} catch (err) {
			if (this.statusTextEl) this.statusTextEl.setText('Migration failed: ' + String(err));
			return;
		}

		this.renderDonePhase();
	}

	// ─── Phase 4: Done ────────────────────────────────────────────────────────

	private renderDonePhase() {
		this.phase = Phase.Done;
		const { contentEl } = this;
		const result = this.migrationResult!;
		contentEl.empty();

		contentEl.createEl('p', {
			text: `Migration complete. ${result.convertedFiles} file${result.convertedFiles !== 1 ? 's' : ''} converted, ${result.updatedNotes} note${result.updatedNotes !== 1 ? 's' : ''} updated.`,
		});

		if (result.skipped.length > 0) {
			this.renderList(contentEl, `Skipped (${result.skipped.length})`, result.skipped);
		}

		if (result.failed.length > 0) {
			this.renderList(contentEl, `Failed (${result.failed.length})`, result.failed);
		}

		const buttonsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-buttons' });

		if (result.updatedNotePaths.length > 0) {
			if (result.updatedNotePaths.length > 10) {
				const randomBtn = buttonsEl.createEl('button', { text: 'Open 10 random notes' });
				randomBtn.addEventListener('click', () => {
					const shuffled = [...result.updatedNotePaths].sort(() => Math.random() - 0.5);
					for (const path of shuffled.slice(0, 10)) {
						this.plugin.app.workspace.openLinkText(path, '', true);
					}
				});
			}

			const openAllBtn = buttonsEl.createEl('button', { text: `Open all ${result.updatedNotePaths.length} notes` });
			openAllBtn.addEventListener('click', () => {
				for (const path of result.updatedNotePaths) {
					this.plugin.app.workspace.openLinkText(path, '', true);
				}
			});
		}

		const doneBtn = buttonsEl.createEl('button', { cls: 'mod-cta', text: 'Done' });
		doneBtn.addEventListener('click', () => this.close());
	}

	// ─── Helpers ─────────────────────────────────────────────────────────────

	private createStat(parent: HTMLElement, count: string, label: string): { countEl: HTMLElement } {
		const statEl = parent.createDiv({ cls: 'ddc_ink_migration-stat' });
		const countEl = statEl.createDiv({ cls: 'ddc_ink_migration-stat-count', text: count });
		statEl.createDiv({ cls: 'ddc_ink_migration-stat-name', text: label });
		return { countEl };
	}
}
