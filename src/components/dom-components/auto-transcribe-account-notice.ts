import { createNoticeTemplate, createNoticeCtaBar, launchPersistentNotice } from 'src/components/dom-components/notice-components';
import { openInkSettingsTab } from 'src/components/dom-components/tabs/settings-tab/settings-tab';
import {
	AUTO_TRANSCRIBE_ACCOUNT_NOTICE_INK_CLOSE_THRESHOLD,
	incrementInkCloseCount,
	isAutoTranscribeAccountNoticeDismissed,
	markAutoTranscribeAccountNoticeDismissed,
} from 'src/logic/device-settings/device-settings';
import { readAlmostUsefulSession } from 'src/logic/almostuseful/almostuseful-session';
import InkPlugin from 'src/main';

///////////
///////////

let noticeShowingOrDismissed = false;

/**
 * Counts one saved ink close and may show the auto-transcribe account notice at the threshold.
 */
export function recordInkCloseAndMaybeShowAccountNotice(plugin: InkPlugin): void {
	if (readAlmostUsefulSession()) return;
	if (isAutoTranscribeAccountNoticeDismissed()) return;

	const inkCloseCount = incrementInkCloseCount();
	if (inkCloseCount < AUTO_TRANSCRIBE_ACCOUNT_NOTICE_INK_CLOSE_THRESHOLD) return;

	showAutoTranscribeAccountNotice(plugin);
}

function showAutoTranscribeAccountNotice(plugin: InkPlugin): void {
	if (noticeShowingOrDismissed) return;
	noticeShowingOrDismissed = true;

	const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate();
	scrollAreaEl.createEl('h1').setText('Auto-transcribe your ink');
	scrollAreaEl.createEl('p').setText(
		'Writing and drawing embeds can be auto-transcribed through an Almost Useful account at almostuseful.xyz.',
	);
	scrollAreaEl.createEl('p').setText('You can link your account in Ink\'s settings.');

	const { primaryBtnEl, tertiaryBtnEl } = createNoticeCtaBar(footerEl, {
		primaryLabel: 'Open Ink settings',
		tertiaryLabel: 'Dismiss',
	});

	const notice = launchPersistentNotice(noticeBody);

	const dismissNotice = (): void => {
		notice.hide();
		markAutoTranscribeAccountNoticeDismissed();
	};

	if (tertiaryBtnEl) {
		tertiaryBtnEl.addEventListener('click', () => {
			dismissNotice();
		});
	}

	if (primaryBtnEl) {
		primaryBtnEl.addEventListener('click', () => {
			dismissNotice();
			openInkSettingsTab(plugin);
		});
	}
}
