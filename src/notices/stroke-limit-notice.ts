import './stroke-limit-notice.scss';
import { Notice } from "obsidian";
import InkPlugin from "src/main";

///////////
///////////

export function showStrokeLimitNotice_maybe(plugin: InkPlugin) {
    // Bail if it's already been shown enough times
    if(plugin.settings.onboardingTips.strokeLimitTipRead) return;

    const noticeBody = document.createDocumentFragment();

    const labelEl = noticeBody.createEl('p')
    labelEl.setText(`Ink plugin`);
    labelEl.classList.add('ddc_ink_notice-label');

    noticeBody.createEl('h1').setText(`Lines disappearing?`);
    noticeBody.createEl('p').setText(`You may have noticed that your handwriting lines have started disapearing...`);
    
    const ctaBarEl = noticeBody.createDiv('ddc_ink_notice-cta-bar');

    const learnBtn = ctaBarEl.createEl('button');
    learnBtn.setText(`Learn why`);
    learnBtn.classList.add('ddc_ink_primary-btn')
    learnBtn.style.pointerEvents = "all";

    const dismissBtn = ctaBarEl.createEl('button');
    dismissBtn.setText(`Dismiss for now`);
    dismissBtn.classList.add('ddc_ink_tertiary-btn')
    dismissBtn.style.pointerEvents = "all";

    const notice = new Notice(noticeBody, 0);
    notice.noticeEl.classList.add('ddc_ink_notice');
    notice.noticeEl.style.pointerEvents = "none";

    dismissBtn.addEventListener('click', () => {
        notice.hide();
    });
    learnBtn.addEventListener('click', () => {
        notice.hide();
        showFullStrokeLimitNotice(plugin);
    });

}

export function showFullStrokeLimitNotice(plugin: InkPlugin) {
    const noticeBody = document.createDocumentFragment();

    const labelEl = noticeBody.createEl('p')
    labelEl.setText(`Ink plugin`);
    labelEl.classList.add('ddc_ink_notice-label');

    noticeBody.createEl('h1').setText(`To help keep writing smooth...`);//     margin-block-start: 0.1em;
    noticeBody.createEl('p').setText(`Hiding old strokes helps keep pen latency down and the writing experience smooth.`);
    noticeBody.createEl('p').setText(`Never fear though, all your strokes still exist and will become visible again later.`);
    noticeBody.createEl('p').setText(`You can adjust the stroke limit in the settings.`);
    
    const ctaBarEl = noticeBody.createDiv('ddc_ink_notice-cta-bar');
    
    const dismissBtn = ctaBarEl.createEl('button');
    dismissBtn.setText(`Dismiss`);
    dismissBtn.classList.add('ddc_ink_tertiary-btn');
    dismissBtn.style.pointerEvents = "all";

    const notice = new Notice(noticeBody, 0);
    notice.noticeEl.classList.add("ddc_ink_notice");
    notice.noticeEl.style.pointerEvents = "none";

    dismissBtn.addEventListener('click', () => {
        notice.hide();
        plugin.settings.onboardingTips.strokeLimitTipRead = true;
        plugin.saveSettings();
    });
    
}