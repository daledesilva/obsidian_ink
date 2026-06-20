import {
	createNoticeCtaBar,
	createNoticeTemplate,
	launchPersistentNotice,
} from 'src/components/dom-components/notice-components';

export function showLegacyInkUnlockNotice(): void {
	const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate();
	scrollAreaEl.createEl('h1').setText('Legacy embed');
	scrollAreaEl.createEl('p').setText(
		'This is a legacy embed and won\'t support all the newest features. Conversion is currently not possible but will be in a future release.',
	);

	const { tertiaryBtnEl } = createNoticeCtaBar(footerEl, {
		tertiaryLabel: 'Dismiss',
	});

	const notice = launchPersistentNotice(noticeBody);

	tertiaryBtnEl?.addEventListener('click', () => {
		notice.hide();
	});
}
