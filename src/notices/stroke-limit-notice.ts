import { createInkNoticeTemplate, createNoticeCtaBar, launchPersistentInkNotice } from 'src/components/dom-components/notice-components';
import InkPlugin from "src/main";

///////////
///////////

export function showStrokeLimitNotice_maybe(plugin: InkPlugin) {
    // Bail if it's already been shown enough times
    if(plugin.settings.onboardingTips.strokeLimitTipRead) return;

    const noticeBody = createInkNoticeTemplate();
    noticeBody.createEl('h1').setText(`Lines disappearing?`);
    noticeBody.createEl('p').setText(`You may have noticed that your handwriting lines have started disapearing...`);
    
    const {
        primaryBtnEl,
        tertiaryBtnEl
    } = createNoticeCtaBar(noticeBody, {
        primaryLabel: 'Learn why',
        tertiaryLabel: 'Dismiss for now',
    })
    
    const notice = launchPersistentInkNotice(noticeBody);

    if(tertiaryBtnEl) {
        tertiaryBtnEl.addEventListener('click', () => {
            notice.hide();
        });
    }
    if(primaryBtnEl) {
        primaryBtnEl.addEventListener('click', () => {
            notice.hide();
            showFullStrokeLimitNotice(plugin);
        });
    }

}

export function showFullStrokeLimitNotice(plugin: InkPlugin) {
    const noticeBody = createInkNoticeTemplate();
    noticeBody.createEl('h1').setText(`To help keep writing smooth...`);//     margin-block-start: 0.1em;
    noticeBody.createEl('p').setText(`Hiding old strokes helps keep pen latency down and the writing experience smooth.`);
    noticeBody.createEl('p').setText(`Never fear though, all your strokes still exist and will become visible again later.`);
    noticeBody.createEl('p').setText(`You can adjust the stroke limit in the settings.`);
    
    const {
        tertiaryBtnEl
    } = createNoticeCtaBar(noticeBody, {
        tertiaryLabel: 'Dismiss',
    })

    const notice = launchPersistentInkNotice(noticeBody);

    if(tertiaryBtnEl) {
        tertiaryBtnEl.addEventListener('click', () => {
            notice.hide();
            plugin.settings.onboardingTips.strokeLimitTipRead = true;
            plugin.saveSettings();
        });
    }
    
}