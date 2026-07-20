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
import {
	executeTldrawSvgMigration,
	scanVaultForTldrawInkSvgFiles,
	type TldrawSvgMigrationResult,
	type TldrawSvgVaultScanResult,
} from 'src/logic/utils/tldraw-svg-migration-logic';

////////
////////

const enum Phase {
	Scanning,
	Confirm,
	Migrating,
	Done,
}

type CombinedMigrationResult = {
	legacy: MigrationResult | null;
	tldraw: TldrawSvgMigrationResult | null;
};

export class MigrationModal extends Modal {
	private plugin: InkPlugin;
	private phase: Phase = Phase.Scanning;
	private scanResult: VaultScanResult | null = null;
	private tldrawScanResult: TldrawSvgVaultScanResult | null = null;
	private migrationResult: CombinedMigrationResult | null = null;
	private migrationOptions: MigrationOptions = { testRun: false };
	/** Fired when a permanent migrate reaches the Done UI so Settings can collapse the card in the background. */
	private readonly onPermanentMigrationFinished?: () => void;

	// DOM refs
	private progressBarInnerEl: HTMLElement | null = null;
	private statusTextEl: HTMLElement | null = null;
	private convertedCountEl: HTMLElement | null = null;
	private remainingCountEl: HTMLElement | null = null;
	private skippedCountEl: HTMLElement | null = null;
	private failedCountEl: HTMLElement | null = null;
	private logEl: HTMLElement | null = null;

	constructor(plugin: InkPlugin, onPermanentMigrationFinished?: () => void) {
		super(plugin.app);
		this.plugin = plugin;
		this.onPermanentMigrationFinished = onPermanentMigrationFinished;
	}

	onOpen() {
		this.titleEl.setText('Migrate legacy ink embeds to ink-canvas');
		this.contentEl.addClass('ddc_ink_migration-modal');
		this.renderScanPhase();
	}

	onClose() {
		this.contentEl.empty();
	}

	private resolveLinkPath = (linkpath: string, sourceNotePath: string): string | null => {
		return this.plugin.app.metadataCache.getFirstLinkpathDest(linkpath, sourceNotePath)?.path ?? null;
	};

	private get legacyFileCount(): number {
		return this.scanResult?.legacyFiles.length ?? 0;
	}

	private get tldrawFileCount(): number {
		return this.tldrawScanResult?.tldrawSvgFiles.length ?? 0;
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
			if (this.statusTextEl) this.statusTextEl.setText('Scanning for .writing / .drawing files…');
			this.scanResult = await scanVaultForLegacyEmbeds(
				this.plugin.app.vault,
				(scanned, tot, foundCount) => {
					const remaining = tot - scanned;
					const pct = tot > 0 ? (scanned / tot) * 100 : 100;
					if (this.progressBarInnerEl) {
						this.progressBarInnerEl.style.width = (pct * 0.5).toFixed(1) + '%';
					}
					if (this.remainingCountEl) this.remainingCountEl.setText(String(remaining));
					if (this.convertedCountEl) this.convertedCountEl.setText(String(foundCount));
				},
			);

			if (this.statusTextEl) this.statusTextEl.setText('Scanning for older tldraw SVG files…');
			this.tldrawScanResult = await scanVaultForTldrawInkSvgFiles(
				this.plugin.app.vault,
				this.resolveLinkPath,
				(scanned, tot, foundCount) => {
					const remaining = tot - scanned;
					const pct = tot > 0 ? (scanned / tot) * 100 : 100;
					if (this.progressBarInnerEl) {
						this.progressBarInnerEl.style.width = (50 + pct * 0.5).toFixed(1) + '%';
					}
					if (this.remainingCountEl) this.remainingCountEl.setText(String(remaining));
					const legacyFound = this.scanResult?.legacyFiles.length ?? 0;
					if (this.convertedCountEl) this.convertedCountEl.setText(String(legacyFound + foundCount));
				},
			);
		} catch (err) {
			if (this.statusTextEl) this.statusTextEl.setText('Scan failed: ' + String(err));
			return;
		}

		if (this.legacyFileCount === 0 && this.tldrawFileCount === 0) {
			this.renderNothingToMigrate();
		} else {
			this.renderConfirmPhase();
		}
	}

	// ─── No legacy embeds found ───────────────────────────────────────────────

	private renderNothingToMigrate() {
		const { contentEl } = this;
		contentEl.empty();
		// Keep "Ink" as the product name.
		// eslint-disable-next-line obsidianmd/ui/sentence-case
		contentEl.createEl('p', { text: 'No legacy Ink files were found in your vault. Nothing to migrate.' });

		const buttonsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-buttons' });
		const doneBtn = buttonsEl.createEl('button', { cls: 'mod-cta', text: 'Done' });
		doneBtn.addEventListener('click', () => this.close());
	}

	// ─── Phase 2: Confirm ─────────────────────────────────────────────────────

	private renderConfirmPhase() {
		this.phase = Phase.Confirm;
		const { contentEl } = this;
		contentEl.empty();

		this.titleEl.setText('Migrate legacy ink files to new format');

		const parts: string[] = [];
		if (this.legacyFileCount > 0) {
			parts.push(
				`${this.legacyFileCount} legacy .writing/.drawing file${this.legacyFileCount !== 1 ? 's' : ''}`,
			);
		}
		if (this.tldrawFileCount > 0) {
			parts.push(
				`${this.tldrawFileCount} older SVG file${this.tldrawFileCount !== 1 ? 's' : ''} still on the previous format`,
			);
		}
		contentEl.createEl('p', {
			text: `Found ${parts.join(' and ')}. This modal migrates them to the newest SVG format.`,
		});

		this.renderMigrationChoiceCards(contentEl);

		const buttonsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-buttons' });
		const cancelBtn = buttonsEl.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());
	}

	private renderMigrationChoiceCards(parent: HTMLElement) {
		const gridEl = parent.createDiv({ cls: 'ddc_ink_migration-choice-grid' });
		const hasLegacyV1 = this.legacyFileCount > 0;

		if (hasLegacyV1) {
			const testCard = gridEl.createDiv({ cls: 'ddc_ink_migration-choice-card' });
			testCard.setAttribute('role', 'button');
			testCard.setAttribute('tabindex', '0');
			testCard.createDiv({ cls: 'ddc_ink_migration-choice-card-title', text: 'Test Migration' });
			testCard.createDiv({
				cls: 'ddc_ink_migration-choice-card-desc',
				text: this.tldrawFileCount > 0
					? `Convert .writing/.drawing files into the new format without deleting the old files. Older SVG files (${this.tldrawFileCount}) are only converted on permanent migrate.`
					: 'Convert legacy files into the new format without deleting the old files. Validate the conversion works before migrating permanently.',
			});
			testCard.addEventListener('click', () => this.startMigration({ testRun: true }));
			testCard.addEventListener('keydown', (ev) => {
				if (ev.key === 'Enter' || ev.key === ' ') {
					ev.preventDefault();
					this.startMigration({ testRun: true });
				}
			});
		}

		const permanentCard = gridEl.createDiv({ cls: 'ddc_ink_migration-choice-card' });
		permanentCard.setAttribute('role', 'button');
		permanentCard.setAttribute('tabindex', '0');
		permanentCard.createDiv({ cls: 'ddc_ink_migration-choice-card-title', text: 'Migrate Permanently' });
		permanentCard.createDiv({
			cls: 'ddc_ink_migration-choice-card-desc',
			text: hasLegacyV1
				? 'Convert legacy .writing/.drawing files (and delete them), convert older SVG files in place, and update links in notes.'
				: 'Convert older SVG files in place to the newest format and update drawing embed framing in notes where needed.',
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

		const legacySteps = this.legacyFileCount + (isTestRun ? 0 : (this.scanResult?.affectedNotes.length ?? 0));
		const tldrawSteps = isTestRun
			? 0
			: this.tldrawFileCount + (this.tldrawScanResult?.affectedNotes.length ?? 0);
		const totalSteps = legacySteps + tldrawSteps;

		const statsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-stats' });
		this.convertedCountEl = this.createStat(statsEl, '0', 'converted').countEl;
		this.remainingCountEl = this.createStat(statsEl, String(totalSteps), 'remaining').countEl;
		this.skippedCountEl = this.createStat(statsEl, '0', 'skipped').countEl;
		this.failedCountEl = this.createStat(statsEl, '0', 'failed').countEl;

		this.logEl = contentEl.createDiv({ cls: 'ddc_ink_migration-log' });
		this.logEl.hide();

		void this.runMigration(totalSteps, legacySteps);
	}

	private async runMigration(totalSteps: number, legacySteps: number) {
		const isTestRun = this.migrationOptions.testRun === true;
		let legacyResult: MigrationResult | null = null;
		let tldrawResult: TldrawSvgMigrationResult | null = null;

		const updateLive = (
			doneInPhase: number,
			phaseOffset: number,
			liveStats: { convertedFiles: number; skippedCount: number; failedCount: number },
			convertedOffset: number,
			skippedOffset: number,
			failedOffset: number,
		) => {
			const done = phaseOffset + doneInPhase;
			const pct = totalSteps > 0 ? (done / totalSteps) * 100 : 100;
			if (this.progressBarInnerEl) this.progressBarInnerEl.style.width = pct.toFixed(1) + '%';
			if (this.remainingCountEl) this.remainingCountEl.setText(String(Math.max(0, totalSteps - done)));
			if (this.convertedCountEl) {
				this.convertedCountEl.setText(String(convertedOffset + liveStats.convertedFiles));
			}
			if (this.skippedCountEl) this.skippedCountEl.setText(String(skippedOffset + liveStats.skippedCount));
			if (this.failedCountEl) this.failedCountEl.setText(String(failedOffset + liveStats.failedCount));
		};

		try {
			if (this.scanResult && this.legacyFileCount > 0) {
				if (this.statusTextEl) {
					this.statusTextEl.setText(
						isTestRun ? 'Converting .writing / .drawing (test)…' : 'Converting .writing / .drawing…',
					);
				}
				legacyResult = await executeMigration(
					this.plugin.app.vault,
					this.scanResult,
					(d, _tot, liveStats) => {
						updateLive(d, 0, liveStats, 0, 0, 0);
					},
					this.migrationOptions,
				);
			}

			// Older SVG (tldraw metadata) conversion is in-place only — permanent migrate.
			if (!isTestRun && this.tldrawScanResult && this.tldrawFileCount > 0) {
				if (this.statusTextEl) this.statusTextEl.setText('Converting older SVG files…');
				const convertedOffset = legacyResult?.convertedFiles ?? 0;
				const skippedOffset = legacyResult?.skipped.length ?? 0;
				const failedOffset = legacyResult?.failed.length ?? 0;
				tldrawResult = await executeTldrawSvgMigration(
					this.plugin.app.vault,
					this.tldrawScanResult,
					(d, _tot, liveStats) => {
						updateLive(d, legacySteps, liveStats, convertedOffset, skippedOffset, failedOffset);
					},
				);
			}
		} catch (err) {
			if (this.statusTextEl) this.statusTextEl.setText('Migration failed: ' + String(err));
			return;
		}

		this.migrationResult = { legacy: legacyResult, tldraw: tldrawResult };
		this.renderDonePhase();
	}

	// ─── Phase 4: Done ────────────────────────────────────────────────────────

	private renderDonePhase() {
		this.phase = Phase.Done;
		const { contentEl } = this;
		const combined = this.migrationResult!;
		const isTestRun = this.migrationOptions.testRun === true;
		contentEl.empty();

		const legacy = combined.legacy;
		const tldraw = combined.tldraw;
		const convertedFiles = (legacy?.convertedFiles ?? 0) + (tldraw?.convertedFiles ?? 0);
		const updatedNotePaths = [
			...(legacy?.updatedNotePaths ?? []),
			...(tldraw?.updatedNotePaths ?? []),
		];
		const uniqueNotePaths = [...new Set(updatedNotePaths)];
		const skipped = [...(legacy?.skipped ?? []), ...(tldraw?.skipped ?? [])];
		const failed = [...(legacy?.failed ?? []), ...(tldraw?.failed ?? [])];

		if (isTestRun) {
			// Keep title-style completion heading.
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			this.titleEl.setText('Test Migration Complete');

			const hasFailures = failed.length > 0;
			const summary = hasFailures
				? `Test migration finished with errors. ${legacy?.convertedFiles ?? 0} file${(legacy?.convertedFiles ?? 0) !== 1 ? 's' : ''} written to ${INK_TEST_CONVERSIONS_FOLDER}/.`
				: `Test migration complete. ${legacy?.convertedFiles ?? 0} file${(legacy?.convertedFiles ?? 0) !== 1 ? 's' : ''} written to ${INK_TEST_CONVERSIONS_FOLDER}/.`;
			contentEl.createEl('p', { text: summary });
			if (this.tldrawFileCount > 0) {
				contentEl.createEl('p', {
					text: `${this.tldrawFileCount} older SVG file${this.tldrawFileCount !== 1 ? 's' : ''} were left unchanged — run Migrate Permanently to convert them.`,
				});
			}

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
				text: `Migration complete. ${convertedFiles} file${convertedFiles !== 1 ? 's' : ''} converted, ${uniqueNotePaths.length} note${uniqueNotePaths.length !== 1 ? 's' : ''} updated.`,
			});
			// Collapse Settings migrate card while this completion UI is still open (visible behind the modal).
			this.onPermanentMigrationFinished?.();
		}

		if (skipped.length > 0) {
			this.renderList(contentEl, `Skipped (${skipped.length})`, skipped);
		}

		if (failed.length > 0) {
			this.renderList(contentEl, `Failed (${failed.length})`, failed);
		}

		const buttonsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-buttons' });

		if (!isTestRun && uniqueNotePaths.length > 0) {
			if (uniqueNotePaths.length > 10) {
				const randomBtn = buttonsEl.createEl('button', { text: 'Open 10 random notes' });
				randomBtn.addEventListener('click', () => {
					const shuffled = [...uniqueNotePaths].sort(() => Math.random() - 0.5);
					for (const path of shuffled.slice(0, 10)) {
						void this.plugin.app.workspace.openLinkText(path, '', true);
					}
				});
			}

			const openAllBtn = buttonsEl.createEl('button', { text: `Open all ${uniqueNotePaths.length} notes` });
			openAllBtn.addEventListener('click', () => {
				for (const path of uniqueNotePaths) {
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
