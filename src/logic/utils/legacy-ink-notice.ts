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
};

export function showLegacyInkUnlockNotice(context: LegacyInkNoticeContext): void {
	const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate();
	scrollAreaEl.createEl('h1').setText('Legacy Ink file');
	scrollAreaEl.createEl('p').setText(
		'This is a legacy Ink file and won\'t support all the newest features. You can migrate it to the new SVG format now.',
	);

	const { primaryBtnEl, tertiaryBtnEl } = createNoticeCtaBar(footerEl, {
		primaryLabel: 'Migrate to new format',
		tertiaryLabel: 'Dismiss',
	});

	const notice = launchPersistentNotice(noticeBody);

	primaryBtnEl?.addEventListener('click', () => {
		if (!primaryBtnEl || primaryBtnEl.disabled) return;
		primaryBtnEl.disabled = true;
		primaryBtnEl.setText('Migrating…');

		void (async (): Promise<void> => {
			try {
				await runLegacyInkMigrationFromNotice(context.plugin, context.legacyFile);
				notice.hide();
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
	});
}
