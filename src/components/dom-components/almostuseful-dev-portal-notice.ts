import { Notice, Setting } from 'obsidian';
import {
	createNoticeCtaBar,
	createNoticeTemplate,
	launchPersistentNotice,
} from 'src/components/dom-components/notice-components';
import { TwoWayToggleSetting } from 'src/components/dom-components/two-way-toggle-setting/two-way-toggle-setting';
import { applyAlmostUsefulDevPortalServer } from 'src/logic/almostuseful/almostuseful-portal-server';
import {
	isAlmostUsefulCustomPortalOriginActive,
	rememberedAlmostUsefulCustomPortalOrigin,
	type AlmostUsefulPortalServerMode,
} from 'src/logic/almostuseful/almostuseful-session';
import { isInkDevelopmentBuild } from 'src/logic/utils/ink-build-mode';
import './almostuseful-dev-portal-notice.scss';

/////////
/////////

let activeDevPortalNotice: Notice | null = null;

/**
 * Development builds only. Pins a launch notice with Production / Custom so
 * the server switch is not buried in settings.
 */
export function showAlmostUsefulDevPortalNotice_maybe(): void {
	if (!isInkDevelopmentBuild()) return;
	if (activeDevPortalNotice) return;

	const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate();
	scrollAreaEl.createEl('h1').setText('Almost Useful server');

	const controlsEl = scrollAreaEl.createDiv('ddc_ink_almostuseful-dev-portal-notice-controls');
	paintAlmostUsefulDevPortalNoticeControls(controlsEl);

	const { tertiaryBtnEl } = createNoticeCtaBar(footerEl, {
		tertiaryLabel: 'Done',
	});

	const notice = launchPersistentNotice(noticeBody);
	activeDevPortalNotice = notice;

	if (tertiaryBtnEl) {
		tertiaryBtnEl.addEventListener('click', () => {
			notice.hide();
			activeDevPortalNotice = null;
		});
	}
}

function paintAlmostUsefulDevPortalNoticeControls(containerEl: HTMLElement): void {
	containerEl.empty();
	const isCustom = isAlmostUsefulCustomPortalOriginActive();
	const customOrigin = rememberedAlmostUsefulCustomPortalOrigin();

	new TwoWayToggleSetting<AlmostUsefulPortalServerMode>(containerEl)
		.setName('Server')
		.setOptionPair('production', 'Production', 'custom', 'Custom')
		.setValue(isCustom ? 'custom' : 'production')
		.onChange((mode) => {
			applyAlmostUsefulDevPortalServer(mode, customOrigin);
			paintAlmostUsefulDevPortalNoticeControls(containerEl);
		});

	if (!isCustom) return;

	new Setting(containerEl)
		.setClass('ddc_ink_setting')
		.setClass('ddc_ink_almostuseful-dev-portal-notice-url')
		.addText((text) => {
			text.setPlaceholder('http://localhost:3000');
			text.setValue(customOrigin);
			text.inputEl.addEventListener('change', () => {
				applyAlmostUsefulDevPortalServer('custom', text.getValue());
			});
		});
}
