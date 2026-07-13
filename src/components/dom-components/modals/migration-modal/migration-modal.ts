import './migration-modal.scss';
import { Modal } from 'obsidian';
import InkPlugin from 'src/main';
import {
	VaultScanResult,
	MigrationResult,
	MigrationOptions,
	INK_TEST_CONVERSIONS_FOLDER,
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
	private migrationOptions: MigrationOptions = { testRun: false };

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
		this.titleEl.setText('Migrate legacy ink embeds to ink-canvas');
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

		void this.runScan();
	}

	private async runScan() {
		try {
			this.scanResult = await scanVaultForLegacyEmbeds(
				this.plugin.app.vault,
				(scanned, tot, foundCount) => {
					const remaining = tot - scanned;
					const pct = tot > 0 ? (scanned / tot) * 100 : 100;
					if (this.progressBarInnerEl) {
						this.progressBarInnerEl.style.width = pct.toFixed(1) + '%';
					}
					if (this.remainingCountEl) this.remainingCountEl.setText(String(remaining));
					// foundCount comes from the scanner — scanResult is null until await finishes
					if (this.convertedCountEl) this.convertedCountEl.setText(String(foundCount));
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
		contentEl.createEl('p', { text: 'No legacy Ink files were found in your vault. Nothing to migrate.' });

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

		this.titleEl.setText('Migrate Legacy Ink Files to New Format');

		const legacyFileCount = scan.legacyFiles.length;
		const noteCount = scan.affectedNotes.length;
		contentEl.createEl('p', {
			text: `Found ${legacyFileCount} legacy Ink file${legacyFileCount !== 1 ? 's' : ''} and ${noteCount} note${noteCount !== 1 ? 's' : ''} to update. This modal will allow you to migrate these to the newest SVG format.`,
		});

		this.renderMigrationChoiceCards(contentEl);

		const buttonsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-buttons' });
		const cancelBtn = buttonsEl.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());
	}

	private renderMigrationChoiceCards(parent: HTMLElement) {
		const gridEl = parent.createDiv({ cls: 'ddc_ink_migration-choice-grid' });

		const testCard = gridEl.createDiv({ cls: 'ddc_ink_migration-choice-card' });
		testCard.setAttribute('role', 'button');
		testCard.setAttribute('tabindex', '0');
		testCard.createDiv({ cls: 'ddc_ink_migration-choice-card-title', text: 'Test Migration' });
		testCard.createDiv({
			cls: 'ddc_ink_migration-choice-card-desc',
			text: 'Convert legacy files into the new format without deleting the old files. Validate the conversion works before migrating permanently.',
		});
		testCard.addEventListener('click', () => this.startMigration({ testRun: true }));
		testCard.addEventListener('keydown', (ev) => {
			if (ev.key === 'Enter' || ev.key === ' ') {
				ev.preventDefault();
				this.startMigration({ testRun: true });
			}
		});

		const permanentCard = gridEl.createDiv({ cls: 'ddc_ink_migration-choice-card' });
		permanentCard.setAttribute('role', 'button');
		permanentCard.setAttribute('tabindex', '0');
		permanentCard.createDiv({ cls: 'ddc_ink_migration-choice-card-title', text: 'Migrate Permanently' });
		permanentCard.createDiv({
			cls: 'ddc_ink_migration-choice-card-desc',
			text: 'Convert the legacy files to the new format, delete the legacy files, and update links in all notes to the new files.',
		});
		permanentCard.addEventListener('click', () => this.startMigration({ testRun: false }));
		permanentCard.addEventListener('keydown', (ev) => {
			if (ev.key === 'Enter' || ev.key === ' ') {
				ev.preventDefault();
				this.startMigration({ testRun: false });
			}
		});
	}

	private startMigration(options: MigrationOptions) {
		this.migrationOptions = options;
		this.renderMigratingPhase();
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

		const isTestRun = this.migrationOptions.testRun === true;
		this.statusTextEl = contentEl.createDiv({
			cls: 'ddc_ink_migration-status-text',
			text: isTestRun ? 'Running test migration…' : 'Migrating…',
		});

		const progressBarEl = contentEl.createDiv({ cls: 'ddc_ink_migration-progress-bar' });
		this.progressBarInnerEl = progressBarEl.createDiv({ cls: 'ddc_ink_migration-progress-bar-inner' });

		const fileCount = this.scanResult!.legacyFiles.length;
		const noteCount = isTestRun ? 0 : this.scanResult!.affectedNotes.length;
		const statsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-stats' });
		this.convertedCountEl = this.createStat(statsEl, '0', 'converted').countEl;
		this.remainingCountEl = this.createStat(statsEl, String(fileCount + noteCount), 'remaining').countEl;
		this.skippedCountEl = this.createStat(statsEl, '0', 'skipped').countEl;
		this.failedCountEl = this.createStat(statsEl, '0', 'failed').countEl;

		this.logEl = contentEl.createDiv({ cls: 'ddc_ink_migration-log' });
		this.logEl.hide();

		void this.runMigration();
	}

	private async runMigration() {
		const scan = this.scanResult!;
		const isTestRun = this.migrationOptions.testRun === true;

		try {
			this.migrationResult = await executeMigration(
				this.plugin.app.vault,
				scan,
				(d, tot, liveStats) => {
					const pct = tot > 0 ? (d / tot) * 100 : 100;
					if (this.progressBarInnerEl) this.progressBarInnerEl.style.width = pct.toFixed(1) + '%';
					if (this.remainingCountEl) this.remainingCountEl.setText(String(tot - d));
					// liveStats are required because migrationResult is only assigned after await
					if (this.convertedCountEl) this.convertedCountEl.setText(String(liveStats.convertedFiles));
					if (this.skippedCountEl) this.skippedCountEl.setText(String(liveStats.skippedCount));
					if (this.failedCountEl) this.failedCountEl.setText(String(liveStats.failedCount));
				},
				this.migrationOptions,
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
		const isTestRun = this.migrationOptions.testRun === true;
		contentEl.empty();

		if (isTestRun) {
			this.titleEl.setText('Test Migration Complete');

			const hasFailures = result.failed.length > 0;
			const summary = hasFailures
				? `Test migration finished with errors. ${result.convertedFiles} file${result.convertedFiles !== 1 ? 's' : ''} written to ${INK_TEST_CONVERSIONS_FOLDER}/.`
				: `Test migration complete. ${result.convertedFiles} file${result.convertedFiles !== 1 ? 's' : ''} written to ${INK_TEST_CONVERSIONS_FOLDER}/.`;
			contentEl.createEl('p', { text: summary });

			const whatsNextEl = contentEl.createDiv({ cls: 'ddc_ink_migration-whats-next' });
			whatsNextEl.createEl('p', { text: "What's next:" });
			const stepsEl = whatsNextEl.createEl('ul');
			stepsEl.createEl('li', {
				text: `Check conversion tests in ${INK_TEST_CONVERSIONS_FOLDER}/.`,
			});
			stepsEl.createEl('li', { text: 'If satisfied, delete test conversions folder.' });
			stepsEl.createEl('li', { text: 'Run migration again permanently.' });
		} else {
			contentEl.createEl('p', {
				text: `Migration complete. ${result.convertedFiles} file${result.convertedFiles !== 1 ? 's' : ''} converted, ${result.updatedNotes} note${result.updatedNotes !== 1 ? 's' : ''} updated.`,
			});
		}

		if (result.skipped.length > 0) {
			this.renderList(contentEl, `Skipped (${result.skipped.length})`, result.skipped);
		}

		if (result.failed.length > 0) {
			this.renderList(contentEl, `Failed (${result.failed.length})`, result.failed);
		}

		const buttonsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-buttons' });

		if (!isTestRun && result.updatedNotePaths.length > 0) {
			if (result.updatedNotePaths.length > 10) {
				const randomBtn = buttonsEl.createEl('button', { text: 'Open 10 random notes' });
				randomBtn.addEventListener('click', () => {
					const shuffled = [...result.updatedNotePaths].sort(() => Math.random() - 0.5);
					for (const path of shuffled.slice(0, 10)) {
						void this.plugin.app.workspace.openLinkText(path, '', true);
					}
				});
			}

			const openAllBtn = buttonsEl.createEl('button', { text: `Open all ${result.updatedNotePaths.length} notes` });
			openAllBtn.addEventListener('click', () => {
				for (const path of result.updatedNotePaths) {
					void this.plugin.app.workspace.openLinkText(path, '', true);
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
