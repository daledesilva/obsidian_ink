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

    const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate(1,3);
    scrollAreaEl.createEl('h1').setText(`Welcome to ink`);
    scrollAreaEl.createEl('p').setText(`Ink is all about enabling pen use directly in your Markdown notes.`);
    scrollAreaEl.createEl('p').setText(`Here's a quick rundown to help you get started...`);
    
    const {
        primaryBtnEl,
        tertiaryBtnEl
    } = createNoticeCtaBar(footerEl, {
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
    const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate();
    scrollAreaEl.createEl('h1').setText(`Inserting handwriting sections...`);
    scrollAreaEl.createEl('p').setText(`In any Markdown note, run the following command to begin writing where your Cursor is.`);
    // Keep command-name casing as shown in the command palette.
    // eslint-disable-next-line obsidianmd/ui/sentence-case
    scrollAreaEl.createEl('blockquote').setText(`"Ink: New handwriting section"`);
    scrollAreaEl.createEl('p').setText(`( Cmd+P or swipe down )`);
    
    const {
        primaryBtnEl,
        tertiaryBtnEl
    } = createNoticeCtaBar(footerEl, {
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
    const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate();
    scrollAreaEl.createEl('h1').setText(`Drawing sections...`);
    scrollAreaEl.createEl('p').setText(`These can be added too and can be resized right in your Markdown file. Use the purple lock icon to save framing, or the standard lock icon to save the drawing but revert the framing.`);
    // Keep command-name casing as shown in the command palette.
    // eslint-disable-next-line obsidianmd/ui/sentence-case
    scrollAreaEl.createEl('blockquote').setText(`"Ink: New drawing"`);

    const {
        primaryBtnEl,
        tertiaryBtnEl
    } = createNoticeCtaBar(footerEl, {
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
    const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate();
    scrollAreaEl.createEl('h1').setText(`If you're using an ipad...`);
    scrollAreaEl.createEl('p').setText(`The 'scribble' feature of the apple pencil can interfere with the ability to write in ink embeds.`);
    scrollAreaEl.createEl('p').setText(`To use ink you will need to turn off scribble in your device settings.`);

    const {
        primaryBtnEl,
        tertiaryBtnEl
    } = createNoticeCtaBar(footerEl, {
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
    const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate();
    scrollAreaEl.createEl('h1').setText(`Syncing with your vault...`);
    scrollAreaEl.createEl('p').setText(`Ink files live in your vault and can sync with it to other devices.`);
    scrollAreaEl.createEl('p').setText(`If using Obsidian Sync, turn on "sync all other types" in the Obsidian Sync settings.`);

    const {
        primaryBtnEl,
        tertiaryBtnEl
    } = createNoticeCtaBar(footerEl, {
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
    const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate();
    scrollAreaEl.createEl('h1').setText(`Get involved...`);
    scrollAreaEl.createEl('p').setText(`If you notice any bugs, please report them through the link in the settings.`);
    scrollAreaEl.createEl('p').setText(`You can also follow along with development and let me know which features are important to you at the links below.`);

    const {
        tertiaryBtnEl
    } = createNoticeCtaBar(footerEl, {
        footerLinks: [
            {
                // Point at the feature-demo reel rather than the long diary playlist.
                href: 'https://youtu.be/plrnx7J_Avc',
                label: 'View feature demos',
            },
            {
                href: 'https://designdebt.club/socials',
                label: 'Follow on socials',
            },
        ],
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
