import { appendAlmostUsefulNoticeAccountCta } from 'src/components/dom-components/almostuseful-link-account-button';
import { createNoticeTemplate, createNoticeCtaBar, launchPersistentNotice } from 'src/components/dom-components/notice-components';
import { isIpad } from 'src/logic/utils/isIpad';
import InkPlugin from "src/main";
import { openInkSettingsTab } from './tabs/settings-tab/settings-tab';

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
    scrollAreaEl.createEl('blockquote').setText(`"Ink: new handwriting section"`);
    scrollAreaEl.createEl('p').setText(`( Cmd+P or swipe down )`);
    
    const {
        primaryBtnEl,
    } = createNoticeCtaBar(footerEl, {
        primaryLabel: 'Continue',
        tertiaryLabel: 'Dismiss for now',
    })

    const notice = launchPersistentNotice(noticeBody);

    if(primaryBtnEl) {
        primaryBtnEl.addEventListener('click', () => {
            notice.hide();
            showOtherSectionsWelcomeTip(plugin);
        });
    }
    
}

/**
 * Drawings and photo tracing after handwriting.
 * The photo chip is the palette name of create-handwriting-from-photo, not a shorter label.
 */
function showOtherSectionsWelcomeTip(plugin: InkPlugin) {
    const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate();
    scrollAreaEl.createEl('h1').setText(`Other sections...`);

    scrollAreaEl.createEl('p').setText(`Drawings:`);
    // Keep command-name casing as shown in the command palette.
    scrollAreaEl.createEl('blockquote').setText(`"Ink: new drawing"`);

    scrollAreaEl.createEl('p').setText(`Trace photos:`);
    // Palette name from create-handwriting-from-photo.
    scrollAreaEl.createEl('blockquote').setText(`"Ink: Insert handwriting/drawing from photos"`);

    const {
        primaryBtnEl,
    } = createNoticeCtaBar(footerEl, {
        primaryLabel: 'Continue',
        tertiaryLabel: 'Dismiss for now',
    })

    const notice = launchPersistentNotice(noticeBody);

    if(primaryBtnEl) {
        primaryBtnEl.addEventListener('click', () => {
            notice.hide();
            showAlmostUsefulAccountWelcomeTip(plugin);
        });
    }
    
}

function showiPadWelcomeTip(plugin: InkPlugin) {
    const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate();
    scrollAreaEl.createEl('h1').setText(`Placeholder...`);
    scrollAreaEl.createEl('p').setText(`Placeholder.`);

    const {
        primaryBtnEl,
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
            completeWelcomeTips(plugin);
        });
    }
    
}

/** Account tip sits after Other sections, then the series continues with syncing. */
function showAlmostUsefulAccountWelcomeTip(plugin: InkPlugin) {
    const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate();
    scrollAreaEl.createEl('h1').setText(`Handwriting transcription...`);
    scrollAreaEl.createEl('p').setText(
        `An optional Almost Useful account provides a subscription service for transcribing your handwriting into searchable text.`,
    );
    const linkAccountBtnEl = appendAlmostUsefulNoticeAccountCta(scrollAreaEl);

    const {
        primaryBtnEl,
        tertiaryBtnEl,
    } = createNoticeCtaBar(footerEl, {
        primaryLabel: 'Continue',
        tertiaryLabel: 'Dismiss',
    })

    const notice = launchPersistentNotice(noticeBody);

    /** Replaces this tip with syncing. Does not mark the welcome series finished. */
    const continueWelcomeSeries = () => {
        notice.hide();
        showSyncingWelcomeTip(plugin);
    };

    // Unlike the version notice, Link account does not end the series. It opens Settings and moves on.
    linkAccountBtnEl.addEventListener('click', () => {
        openInkSettingsTab(plugin);
        continueWelcomeSeries();
    });

    if(primaryBtnEl) {
        primaryBtnEl.addEventListener('click', () => {
            continueWelcomeSeries();
        });
    }

    if(tertiaryBtnEl) {
        tertiaryBtnEl.addEventListener('click', () => {
            // Early exit: syncing and Get involved are skipped, and the series does not show again.
            notice.hide();
            completeWelcomeTips(plugin);
        });
    }
}

/** Marks first-run tips finished so a later launch shows version tips instead of welcome again. */
function completeWelcomeTips(plugin: InkPlugin) {
    tipsShowingOrDismissed = false;
    plugin.settings.onboardingTips.welcomeTipRead = true;
    plugin.settings.onboardingTips.lastVersionTipRead = plugin.manifest.version;
    void plugin.saveSettings();
}
