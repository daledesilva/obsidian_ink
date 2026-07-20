import { Notice, TFile } from 'obsidian';
import InkPlugin from 'src/main';
import {
	createNoticeCtaBar,
	createNoticeTemplate,
	launchPersistentNotice,
} from 'src/components/dom-components/notice-components';
import { runLegacyInkMigrationFromNotice } from 'src/logic/utils/migrate-legacy-ink-on-open';

export type LegacyInkNoticeContext = {
	plugin: InkPlugin;
	legacyFile: TFile;
	/** When true, migration refreshes the note embed in place instead of opening a dedicated ink view. */
	isEmbedded?: boolean;
};

type TrackedLegacyInkNotice = {
	filePath: string;
	notice: Notice;
};

/** One persistent notice per legacy file — embed + dedicated must not stack stale CTAs. */
const activeLegacyInkNotices: TrackedLegacyInkNotice[] = [];

/**
 * Hides any open "Legacy Ink file" notices for this attachment path.
 * Used when expanding to a dedicated view or after a successful migrate so a
 * leftover embed notice cannot migrate a file that was already converted/deleted.
 */
export function dismissLegacyInkNoticesForFile(filePath: string): void {
	for (let index = activeLegacyInkNotices.length - 1; index >= 0; index--) {
		const entry = activeLegacyInkNotices[index];
		if (entry.filePath !== filePath) continue;
		entry.notice.hide();
		activeLegacyInkNotices.splice(index, 1);
	}
}

function trackLegacyInkNotice(filePath: string, notice: Notice): void {
	// Replace any prior notice for the same file (e.g. embed notice when dedicated mounts).
	dismissLegacyInkNoticesForFile(filePath);
	activeLegacyInkNotices.push({ filePath, notice });
}

function untrackLegacyInkNotice(notice: Notice): void {
	const index = activeLegacyInkNotices.findIndex((entry) => entry.notice === notice);
	if (index >= 0) activeLegacyInkNotices.splice(index, 1);
}

/**
 * Persistent CTA shown when a legacy ink editor mounts. Migration keeps the note
 * in place for embeds; dedicated views reopen the converted SVG (see migrate-legacy-ink-on-open).
 */
export function showLegacyInkUnlockNotice(context: LegacyInkNoticeContext): void {
	const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate();
	// Keep "Ink" / "SVG" product and acronym casing.
	scrollAreaEl.createEl('h1').setText('Legacy Ink file');
	scrollAreaEl.createEl('p').setText(
		'This is a legacy Ink file and won\'t support all the newest features. You can migrate it to the new SVG format now.',
	);

	const { primaryBtnEl, tertiaryBtnEl } = createNoticeCtaBar(footerEl, {
		primaryLabel: 'Migrate to new format',
		tertiaryLabel: 'Dismiss',
	});

	const notice = launchPersistentNotice(noticeBody);
	trackLegacyInkNotice(context.legacyFile.path, notice);

	primaryBtnEl?.addEventListener('click', () => {
		if (!primaryBtnEl || primaryBtnEl.disabled) return;
		primaryBtnEl.disabled = true;
		primaryBtnEl.setText('Migrating…');

		void (async (): Promise<void> => {
			try {
				await runLegacyInkMigrationFromNotice(context.plugin, context.legacyFile, {
					isEmbedded: context.isEmbedded,
				});
				dismissLegacyInkNoticesForFile(context.legacyFile.path);
			} catch (err) {
				new Notice('Migration failed: ' + String(err));
			} finally {
				primaryBtnEl.disabled = false;
				primaryBtnEl.setText('Migrate to new format');
			}
		})();
	});

	tertiaryBtnEl?.addEventListener('click', () => {
		notice.hide();
		untrackLegacyInkNotice(notice);
	});
}
