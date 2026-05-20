import { createNoticeTemplate, createNoticeCtaBar, launchPersistentNotice } from 'src/components/dom-components/notice-components';
import { isIpad } from 'src/logic/utils/isIpad';
import InkPlugin from "src/main";

///////////
///////////

export function showWelcomeTips_maybe(plugin: InkPlugin): boolean {
    // Bail if it's already been shown enough times
    if(plugin.settings.onboardingTips.welcomeTipRead) return false;
    void showWelcomeTips(plugin);
    return true;
}

let tipsShowingOrDismissed: boolean = false;
export async function showWelcomeTips(plugin: InkPlugin) {
    if(tipsShowingOrDismissed) return;
    tipsShowingOrDismissed = true;

    const noticeBody = createNoticeTemplate(1,3);
    noticeBody.createEl('h1').setText(`Welcome to ink`);
    noticeBody.createEl('p').setText(`Ink is all about enabling stylus use directly in your Markdown notes.`);
    noticeBody.createEl('p').setText(`Here's a quick rundown to help you get started...`);
    
    const {
        primaryBtnEl,
        tertiaryBtnEl
    } = createNoticeCtaBar(noticeBody, {
        primaryLabel: `Read now`,
        tertiaryLabel: 'Remind me later',
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
            showHandwritingWelcomeTip(plugin);
        });
    }

}

function showHandwritingWelcomeTip(plugin: InkPlugin) {
    const noticeBody = createNoticeTemplate();
    noticeBody.createEl('h1').setText(`Inserting handwriting sections...`);
    noticeBody.createEl('p').setText(`In any Markdown note, run the following command to begin writing where your cursor is.`);
    noticeBody.createEl('blockquote').setText(`"ink: New handwriting section"`);
    noticeBody.createEl('p').setText(`( Cmd+P or swipe down )`);
    
    const {
        primaryBtnEl,
        tertiaryBtnEl
    } = createNoticeCtaBar(noticeBody, {
        primaryLabel: 'Continue',
        tertiaryLabel: 'Dismiss for now',
    })

    const notice = launchPersistentNotice(noticeBody);

    if(primaryBtnEl) {
        primaryBtnEl.addEventListener('click', () => {
            notice.hide();
            showDrawingWelcomeTip(plugin);
        });
    }
    
}

function showDrawingWelcomeTip(plugin: InkPlugin) {
    const noticeBody = createNoticeTemplate();
    noticeBody.createEl('h1').setText(`Drawing sections...`);
    noticeBody.createEl('p').setText(`These can be added too and can be resized right in your Markdown file.`);
    noticeBody.createEl('blockquote').setText(`"ink: New drawing"`);

    const {
        primaryBtnEl,
        tertiaryBtnEl
    } = createNoticeCtaBar(noticeBody, {
        primaryLabel: 'Continue',
        tertiaryLabel: 'Dismiss for now',
    })

    const notice = launchPersistentNotice(noticeBody);

    if(primaryBtnEl) {
        primaryBtnEl.addEventListener('click', () => {
            notice.hide();
            if(isIpad()) {
                showiPadWelcomeTip(plugin);
            } else {
                showSyncingWelcomeTip(plugin);
            }
        });
    }
    
}

function showiPadWelcomeTip(plugin: InkPlugin) {
    const noticeBody = createNoticeTemplate();
    noticeBody.createEl('h1').setText(`If you're using an ipad...`);
    noticeBody.createEl('p').setText(`The 'scribble' feature of the apple pencil can interfere with the ability to write in ink embeds.`);
    noticeBody.createEl('p').setText(`To use ink you will need to turn off scribble in your device settings.`);

    const {
        primaryBtnEl,
        tertiaryBtnEl
    } = createNoticeCtaBar(noticeBody, {
        primaryLabel: 'Continue',
        tertiaryLabel: 'Dismiss for now',
    })

    const notice = launchPersistentNotice(noticeBody);

    if(primaryBtnEl) {
        primaryBtnEl.addEventListener('click', () => {
            notice.hide();
            showSyncingWelcomeTip(plugin);
        });
    }
    
}

function showSyncingWelcomeTip(plugin: InkPlugin) {
    const noticeBody = createNoticeTemplate();
    noticeBody.createEl('h1').setText(`Syncing with your vault...`);
    noticeBody.createEl('p').setText(`Ink files live in your vault and can sync with it to other devices.`);
    noticeBody.createEl('p').setText(`If using Obsidian Sync, turn on "sync all other types" in the Obsidian Sync settings.`);

    const {
        primaryBtnEl,
        tertiaryBtnEl
    } = createNoticeCtaBar(noticeBody, {
        primaryLabel: 'Continue',
        tertiaryLabel: 'Dismiss for now',
    })

    const notice = launchPersistentNotice(noticeBody);

    if(primaryBtnEl) {
        primaryBtnEl.addEventListener('click', () => {
            notice.hide();
            showDevelopmentWelcomeTip(plugin);
        });
    }
    
}


function showDevelopmentWelcomeTip(plugin: InkPlugin) {
    const noticeBody = createNoticeTemplate();
    noticeBody.createEl('h1').setText(`Get involved...`);
    noticeBody.createEl('p').setText(`If you notice any bugs, please report them through the link in the settings.`);
    noticeBody.createEl('p').setText(`You can also follow along with development and let me know which features are important to you at the links below.`);

    const link1 = noticeBody.createEl('a');
    link1.setAttribute('href', 'https://youtube.com/playlist?list=PLAiv7XV4xFx2NMRSCxdGiVombKO-TiMAL&si=GVp9ILvCAaRTwyYd')
    link1.setText(`View development diaries`);
    // Prevent clicking link from closing notice
    link1.onClickEvent( e => e.stopPropagation())

    noticeBody.createEl('br');
    
    const link2 = noticeBody.createEl('a');
    link2.setAttribute('href', 'https://designdebt.club/socials')
    link2.setText(`Follow on socials`);
    // Prevent clicking link from closing notice
    link2.onClickEvent( e => e.stopPropagation())
    
    const {
        tertiaryBtnEl
    } = createNoticeCtaBar(noticeBody, {
        tertiaryLabel: 'Dismiss',
    })

    const notice = launchPersistentNotice(noticeBody);

    if(tertiaryBtnEl) {
        tertiaryBtnEl.addEventListener('click', () => {
            notice.hide();
            tipsShowingOrDismissed = false;
            plugin.settings.onboardingTips.welcomeTipRead = true;
            plugin.settings.onboardingTips.lastVersionTipRead = plugin.manifest.version;
            void plugin.saveSettings();
        });
    }
    
}