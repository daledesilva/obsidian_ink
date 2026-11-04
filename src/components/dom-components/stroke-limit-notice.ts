import { createNoticeCtaBar, launchPagedNotice, type PagedNotice } from 'src/components/dom-components/notice-components';
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

/** Opens both stroke-limit pages in one notice so a second page does not take a new stack slot. */
function showStrokeLimitTips(plugin: InkPlugin) {
    if(tipsShowingOrDismissed) return;
    tipsShowingOrDismissed = true;

    const pagedNotice = launchPagedNotice();
    showStrokeLimitIntroPage(plugin, pagedNotice);
}

/** First page. Dismiss for now hides the notice and does not mark the tip read. */
function showStrokeLimitIntroPage(plugin: InkPlugin, pagedNotice: PagedNotice) {
    pagedNotice.setPage((host) => {
        host.scrollAreaEl.createEl('h1').setText(`Lines disappearing?`);
        host.scrollAreaEl.createEl('p').setText(`You may have noticed that your handwriting lines have started disapearing...`);

        const {
            primaryBtnEl,
            tertiaryBtnEl
        } = createNoticeCtaBar(host.footerEl, {
            primaryLabel: 'Learn why',
            tertiaryLabel: 'Dismiss for now',
        })

        if(tertiaryBtnEl) {
            tertiaryBtnEl.addEventListener('click', () => {
                pagedNotice.hide();
            });
        }
        if(primaryBtnEl) {
            primaryBtnEl.addEventListener('click', () => {
                showFullStrokeLimitTip(plugin, pagedNotice);
            });
        }
    });
}

/** Second page. Dismiss hides the notice and marks the tip read. */
function showFullStrokeLimitTip(plugin: InkPlugin, pagedNotice: PagedNotice) {
    pagedNotice.setPage((host) => {
        host.scrollAreaEl.createEl('h1').setText(`To help keep writing smooth...`);
        host.scrollAreaEl.createEl('p').setText(`Hiding old strokes helps keep pen latency down and the writing experience smooth.`);
        host.scrollAreaEl.createEl('p').setText(`Never fear though, all your strokes still exist and will become visible again later.`);
        host.scrollAreaEl.createEl('p').setText(`When you lock or save the embed, those strokes become visible again.`);

        const {
            tertiaryBtnEl
        } = createNoticeCtaBar(host.footerEl, {
            tertiaryLabel: 'Dismiss',
        })

        if(tertiaryBtnEl) {
            tertiaryBtnEl.addEventListener('click', () => {
                pagedNotice.hide();
                tipsShowingOrDismissed = false;
                plugin.settings.onboardingTips.strokeLimitTipRead = true;
                void plugin.saveSettings();
            });
        }
    });
}
