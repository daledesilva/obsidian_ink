import { createNoticeTemplate, createNoticeCtaBar, launchPersistentNotice } from 'src/components/dom-components/notice-components';
import InkPlugin from "src/main";

///////////
///////////

export function showStrokeLimitTips_maybe(plugin: InkPlugin) {
    // Bail if it's already been shown enough times
    if(plugin.settings.onboardingTips.strokeLimitTipRead) return;
    showStrokeLimitTips_debounced(plugin);
}

const tips_timeouts: number[] = [];
let tipsShowingOrDismissed: boolean = false;
function showStrokeLimitTips_debounced(plugin: InkPlugin) {
    while(tips_timeouts.length > 0) {
        window.clearTimeout(tips_timeouts.pop());
    }
    const newTimeout = window.setTimeout( () => {
        showStrokeLimitTips(plugin)
    }, 5000);
    tips_timeouts.push(newTimeout);
}

function showStrokeLimitTips(plugin: InkPlugin) {
    if(tipsShowingOrDismissed) return;
    tipsShowingOrDismissed = true;

    const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate();
    scrollAreaEl.createEl('h1').setText(`Lines disappearing?`);
    scrollAreaEl.createEl('p').setText(`You may have noticed that your handwriting lines have started disapearing...`);
    
    const {
        primaryBtnEl,
        tertiaryBtnEl
    } = createNoticeCtaBar(footerEl, {
        primaryLabel: 'Learn why',
        tertiaryLabel: 'Dismiss for now',
    })
    
    const notice = launchPersistentNotice(noticeBody);

    if(tertiaryBtnEl) {
        tertiaryBtnEl.addEventListener('click', () => {
            notice.hide();
        });
    }
    if(primaryBtnEl) {
        primaryBtnEl.addEventListener('click', () => {
            notice.hide();
            showFullStrokeLimitTip(plugin);
        });
    }

}

function showFullStrokeLimitTip(plugin: InkPlugin) {
    const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate();
    scrollAreaEl.createEl('h1').setText(`To help keep writing smooth...`);//     margin-block-start: 0.1em;
    scrollAreaEl.createEl('p').setText(`Hiding old strokes helps keep pen latency down and the writing experience smooth.`);
    scrollAreaEl.createEl('p').setText(`Never fear though, all your strokes still exist and will become visible again later.`);
    scrollAreaEl.createEl('p').setText(`When you lock or save the embed, those strokes become visible again.`);
    
    const {
        tertiaryBtnEl
    } = createNoticeCtaBar(footerEl, {
        tertiaryLabel: 'Dismiss',
    })

    const notice = launchPersistentNotice(noticeBody);

    if(tertiaryBtnEl) {
        tertiaryBtnEl.addEventListener('click', () => {
            notice.hide();
            tipsShowingOrDismissed = false;
            plugin.settings.onboardingTips.strokeLimitTipRead = true;
            void plugin.saveSettings();
        });
    }
    
}
