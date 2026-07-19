import '../migration-modal/migration-modal.scss';
import { Modal } from 'obsidian';
import InkPlugin from 'src/main';
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

export class TldrawSvgMigrationModal extends Modal {
	private plugin: InkPlugin;
	private scanResult: TldrawSvgVaultScanResult | null = null;
	private migrationResult: TldrawSvgMigrationResult | null = null;

	private progressBarInnerEl: HTMLElement | null = null;
	private statusTextEl: HTMLElement | null = null;
	private convertedCountEl: HTMLElement | null = null;
	private remainingCountEl: HTMLElement | null = null;
	private skippedCountEl: HTMLElement | null = null;
	private failedCountEl: HTMLElement | null = null;

	constructor(plugin: InkPlugin) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onOpen() {
		this.titleEl.setText('Migrate tldraw SVG files to ink-canvas');
		this.contentEl.addClass('ddc_ink_migration-modal');
		this.renderScanPhase();
	}

	onClose() {
		this.contentEl.empty();
	}

	private renderScanPhase() {
		const { contentEl } = this;
		contentEl.empty();

		this.statusTextEl = contentEl.createDiv({
			cls: 'ddc_ink_migration-status-text',
			text: 'Scanning vault for tldraw SVG files…',
		});

		const progressBarEl = contentEl.createDiv({ cls: 'ddc_ink_migration-progress-bar' });
		this.progressBarInnerEl = progressBarEl.createDiv({ cls: 'ddc_ink_migration-progress-bar-inner' });

		const statsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-stats' });
		this.remainingCountEl = this.createStat(statsEl, '0', 'remaining').countEl;
		this.convertedCountEl = this.createStat(statsEl, '0', 'found').countEl;

		void this.runScan();
	}

	private async runScan() {
		const resolveLinkPath = (linkpath: string, sourceNotePath: string) => {
			const resolved = this.plugin.app.metadataCache.getFirstLinkpathDest(linkpath, sourceNotePath);
			return resolved?.path ?? null;
		};

		try {
			this.scanResult = await scanVaultForTldrawInkSvgFiles(
				this.plugin.app.vault,
				resolveLinkPath,
				(scanned, tot, foundCount) => {
					const remaining = tot - scanned;
					const pct = tot > 0 ? (scanned / tot) * 100 : 100;
					if (this.progressBarInnerEl) {
						this.progressBarInnerEl.style.width = pct.toFixed(1) + '%';
					}
					if (this.remainingCountEl) this.remainingCountEl.setText(String(remaining));
					// foundCount comes from the scanner — scanResult is null until await finishes
					if (this.convertedCountEl) {
						this.convertedCountEl.setText(String(foundCount));
					}
				},
			);
		} catch (err) {
			if (this.statusTextEl) this.statusTextEl.setText('Scan failed: ' + String(err));
			return;
		}

		if (this.scanResult.tldrawSvgFiles.length === 0) {
			this.renderNothingToMigrate();
		} else {
			this.renderConfirmPhase();
		}
	}

	private renderNothingToMigrate() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('p', {
			text: 'No v2 tldraw SVG files referenced by embeds were found. Nothing to migrate.',
		});

		const buttonsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-buttons' });
		const doneBtn = buttonsEl.createEl('button', { cls: 'mod-cta', text: 'Done' });
		doneBtn.addEventListener('click', () => this.close());
	}

	private renderConfirmPhase() {
		const { contentEl } = this;
		const scan = this.scanResult!;
		contentEl.empty();

		contentEl.createEl('p', {
			text: `Developer tool: found ${scan.tldrawSvgFiles.length} tldraw SVG file${scan.tldrawSvgFiles.length !== 1 ? 's' : ''} and ${scan.affectedNotes.length} note${scan.affectedNotes.length !== 1 ? 's' : ''} referencing them. Each file will be upgraded in place to ink-canvas metadata. Drawing embeds will get a viewBox fitted to stroke bounds. Writing embed lines are unchanged.`,
		});

		this.renderList(
			contentEl,
			`SVG files to convert (${scan.tldrawSvgFiles.length})`,
			scan.tldrawSvgFiles.map(e => e.svgFile.path),
		);

		this.renderList(
			contentEl,
			`Notes that may be updated (${scan.affectedNotes.length})`,
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

	private renderMigratingPhase() {
		const { contentEl } = this;
		contentEl.empty();

		this.statusTextEl = contentEl.createDiv({ cls: 'ddc_ink_migration-status-text', text: 'Migrating…' });

		const progressBarEl = contentEl.createDiv({ cls: 'ddc_ink_migration-progress-bar' });
		this.progressBarInnerEl = progressBarEl.createDiv({ cls: 'ddc_ink_migration-progress-bar-inner' });

		const statsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-stats' });
		this.convertedCountEl = this.createStat(statsEl, '0', 'converted').countEl;
		this.remainingCountEl = this.createStat(
			statsEl,
			String(this.scanResult!.tldrawSvgFiles.length + this.scanResult!.affectedNotes.length),
			'remaining',
		).countEl;
		this.skippedCountEl = this.createStat(statsEl, '0', 'skipped').countEl;
		this.failedCountEl = this.createStat(statsEl, '0', 'failed').countEl;

		void this.runMigration();
	}

	private async runMigration() {
		const scan = this.scanResult!;

		try {
			this.migrationResult = await executeTldrawSvgMigration(
				this.plugin.app.vault,
				scan,
				(d, tot, liveStats) => {
					const pct = tot > 0 ? (d / tot) * 100 : 100;
					if (this.progressBarInnerEl) this.progressBarInnerEl.style.width = pct.toFixed(1) + '%';
					if (this.remainingCountEl) this.remainingCountEl.setText(String(tot - d));
					// liveStats are required because migrationResult is only assigned after await
					if (this.convertedCountEl) {
						this.convertedCountEl.setText(String(liveStats.convertedFiles));
					}
					if (this.skippedCountEl) {
						this.skippedCountEl.setText(String(liveStats.skippedCount));
					}
					if (this.failedCountEl) {
						this.failedCountEl.setText(String(liveStats.failedCount));
					}
				},
			);
		} catch (err) {
			if (this.statusTextEl) this.statusTextEl.setText('Migration failed: ' + String(err));
			return;
		}

		this.renderDonePhase();
	}

	private renderDonePhase() {
		const { contentEl } = this;
		const result = this.migrationResult!;
		contentEl.empty();

		contentEl.createEl('p', {
			text: `Migration complete. ${result.convertedFiles} file${result.convertedFiles !== 1 ? 's' : ''} converted, ${result.updatedNotes} drawing note${result.updatedNotes !== 1 ? 's' : ''} updated with fitted viewBox.`,
		});

		if (result.skipped.length > 0) {
			this.renderList(contentEl, `Skipped (${result.skipped.length})`, result.skipped);
		}

		if (result.failed.length > 0) {
			this.renderList(contentEl, `Failed (${result.failed.length})`, result.failed);
		}

		const buttonsEl = contentEl.createDiv({ cls: 'ddc_ink_migration-buttons' });

		if (result.updatedNotePaths.length > 0) {
			const openAllBtn = buttonsEl.createEl('button', {
				text: `Open all ${result.updatedNotePaths.length} updated notes`,
			});
			openAllBtn.addEventListener('click', () => {
				for (const path of result.updatedNotePaths) {
					void this.plugin.app.workspace.openLinkText(path, '', true);
				}
			});
		}

		const doneBtn = buttonsEl.createEl('button', { cls: 'mod-cta', text: 'Done' });
		doneBtn.addEventListener('click', () => this.close());
	}

	private createStat(parent: HTMLElement, count: string, label: string): { countEl: HTMLElement } {
		const statEl = parent.createDiv({ cls: 'ddc_ink_migration-stat' });
		const countEl = statEl.createDiv({ cls: 'ddc_ink_migration-stat-count', text: count });
		statEl.createDiv({ cls: 'ddc_ink_migration-stat-name', text: label });
		return { countEl };
	}
}
