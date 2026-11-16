import { Notice } from 'obsidian';
import { appendAlmostUsefulNoticeAccountCta } from 'src/components/dom-components/almostuseful-link-account-button';
import { createNoticeCtaBar, launchPagedNotice, type PagedNotice } from 'src/components/dom-components/notice-components';
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

/** Opens the first-run series in one notice. Later pages replace that notice instead of opening another. */
export async function showWelcomeTips(plugin: InkPlugin) {
    if(tipsShowingOrDismissed) return;
    tipsShowingOrDismissed = true;

    const pagedNotice = launchPagedNotice();
    // Remind me later hides the card without finishing the series. Drop the guard once it is gone
    // so Welcome tips in settings can open it again.
    clearWelcomeGuardWhenNoticeCloses(pagedNotice.notice);
    showWelcomeIntroPage(plugin, pagedNotice);
}

/** Lets settings reopen the series after the card has actually left the screen. */
function clearWelcomeGuardWhenNoticeCloses(notice: Notice): void {
    const shellEl = notice.noticeEl.closest('.notice') ?? notice.noticeEl;
    const parentEl = shellEl.parentElement;
    if (!parentEl) return;
    const observer = new MutationObserver(() => {
        if (shellEl.isConnected) return;
        observer.disconnect();
        tipsShowingOrDismissed = false;
    });
    observer.observe(parentEl, { childList: true });
}

/** First page. Remind me later hides this notice and does not mark the series read. */
function showWelcomeIntroPage(plugin: InkPlugin, pagedNotice: PagedNotice) {
    pagedNotice.setPage((host) => {
        host.scrollAreaEl.createEl('h1').setText(`Welcome to ink`);
        host.scrollAreaEl.createEl('p').setText(`Ink is all about enabling pen use directly in your Markdown notes.`);
        host.scrollAreaEl.createEl('p').setText(`Here's a quick rundown to help you get started...`);

        const {
            primaryBtnEl,
            tertiaryBtnEl
        } = createNoticeCtaBar(host.footerEl, {
            primaryLabel: `Read now`,
            tertiaryLabel: 'Remind me later',
        })

        if(tertiaryBtnEl) {
            tertiaryBtnEl.addEventListener('click', () => {
                remindWelcomeLater(pagedNotice);
            });
        }
        if(primaryBtnEl) {
            primaryBtnEl.addEventListener('click', () => {
                showHandwritingWelcomeTip(plugin, pagedNotice);
            });
        }
    });
}

/** Handwriting command page. Remind me later hides the card and does not mark the series read. */
function showHandwritingWelcomeTip(plugin: InkPlugin, pagedNotice: PagedNotice) {
    pagedNotice.setPage((host) => {
        host.scrollAreaEl.createEl('h1').setText(`Inserting handwriting sections...`);
        host.scrollAreaEl.createEl('p').setText(`In any Markdown note, run the following command to begin writing where your Cursor is.`);
        // Keep command-name casing as shown in the command palette.
        host.scrollAreaEl.createEl('blockquote').setText(`"Ink: new handwriting section"`);
        host.scrollAreaEl.createEl('p').setText(`( Cmd+P or swipe down )`);

        const {
            primaryBtnEl,
            tertiaryBtnEl,
        } = createNoticeCtaBar(host.footerEl, {
            primaryLabel: 'Continue',
            tertiaryLabel: 'Remind me later',
        })

        if(tertiaryBtnEl) {
            tertiaryBtnEl.addEventListener('click', () => {
                remindWelcomeLater(pagedNotice);
            });
        }
        if(primaryBtnEl) {
            primaryBtnEl.addEventListener('click', () => {
                showOtherSectionsWelcomeTip(plugin, pagedNotice);
            });
        }
    });
}

/**
 * Drawings and photo tracing after handwriting.
 * The photo chip is the palette name of create-handwriting-from-photo, not a shorter label.
 */
function showOtherSectionsWelcomeTip(plugin: InkPlugin, pagedNotice: PagedNotice) {
    pagedNotice.setPage((host) => {
        host.scrollAreaEl.createEl('h1').setText(`Other sections...`);

        host.scrollAreaEl.createEl('p').setText(`Drawings:`);
        // Keep command-name casing as shown in the command palette.
        host.scrollAreaEl.createEl('blockquote').setText(`"Ink: new drawing"`);

        host.scrollAreaEl.createEl('p').setText(`Trace photos:`);
        // Palette name from create-handwriting-from-photo.
        host.scrollAreaEl.createEl('blockquote').setText(`"Ink: Insert handwriting/drawing from photos"`);

        const {
            primaryBtnEl,
            tertiaryBtnEl,
        } = createNoticeCtaBar(host.footerEl, {
            primaryLabel: 'Continue',
            tertiaryLabel: 'Remind me later',
        })

        if(tertiaryBtnEl) {
            tertiaryBtnEl.addEventListener('click', () => {
                remindWelcomeLater(pagedNotice);
            });
        }
        if(primaryBtnEl) {
            primaryBtnEl.addEventListener('click', () => {
                showAlmostUsefulAccountWelcomeTip(plugin, pagedNotice);
            });
        }
    });
}

/** Unused placeholder page. Stays on the same notice if a caller wires it in later. */
function showiPadWelcomeTip(plugin: InkPlugin, pagedNotice: PagedNotice) {
    pagedNotice.setPage((host) => {
        host.scrollAreaEl.createEl('h1').setText(`Placeholder...`);
        host.scrollAreaEl.createEl('p').setText(`Placeholder.`);

        const {
            primaryBtnEl,
            tertiaryBtnEl,
        } = createNoticeCtaBar(host.footerEl, {
            primaryLabel: 'Continue',
            tertiaryLabel: 'Remind me later',
        })

        if(tertiaryBtnEl) {
            tertiaryBtnEl.addEventListener('click', () => {
                remindWelcomeLater(pagedNotice);
            });
        }
        if(primaryBtnEl) {
            primaryBtnEl.addEventListener('click', () => {
                showSyncingWelcomeTip(plugin, pagedNotice);
            });
        }
    });
}

/** Vault sync page. Remind me later hides the card and does not mark the series read. */
function showSyncingWelcomeTip(plugin: InkPlugin, pagedNotice: PagedNotice) {
    pagedNotice.setPage((host) => {
        host.scrollAreaEl.createEl('h1').setText(`Syncing with your vault...`);
        host.scrollAreaEl.createEl('p').setText(`Ink files live in your vault and can sync with it to other devices.`);
        host.scrollAreaEl.createEl('p').setText(`If using Obsidian Sync, turn on "sync all other types" in the Obsidian Sync settings.`);

        const {
            primaryBtnEl,
            tertiaryBtnEl,
        } = createNoticeCtaBar(host.footerEl, {
            primaryLabel: 'Continue',
            tertiaryLabel: 'Remind me later',
        })

        if(tertiaryBtnEl) {
            tertiaryBtnEl.addEventListener('click', () => {
                remindWelcomeLater(pagedNotice);
            });
        }
        if(primaryBtnEl) {
            primaryBtnEl.addEventListener('click', () => {
                showDevelopmentWelcomeTip(plugin, pagedNotice);
            });
        }
    });
}

/** Last page. Dismiss marks the series finished. */
function showDevelopmentWelcomeTip(plugin: InkPlugin, pagedNotice: PagedNotice) {
    pagedNotice.setPage((host) => {
        host.scrollAreaEl.createEl('h1').setText(`Get involved...`);
        host.scrollAreaEl.createEl('p').setText(`If you notice any bugs, please report them through the link in the settings.`);
        host.scrollAreaEl.createEl('p').setText(`You can also follow along with development and let me know which features are important to you at the links below.`);

        const {
            tertiaryBtnEl
        } = createNoticeCtaBar(host.footerEl, {
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

        if(tertiaryBtnEl) {
            tertiaryBtnEl.addEventListener('click', () => {
                pagedNotice.hide();
                completeWelcomeTips(plugin);
            });
        }
    });
}

/** Account tip sits after Other sections, then the series continues with syncing. */
function showAlmostUsefulAccountWelcomeTip(plugin: InkPlugin, pagedNotice: PagedNotice) {
    pagedNotice.setPage((host) => {
        host.scrollAreaEl.createEl('h1').setText(`Handwriting transcription...`);
        host.scrollAreaEl.createEl('p').setText(
            `An optional Almost Useful account provides a subscription service for transcribing your handwriting into searchable text.`,
        );
        const linkAccountBtnEl = appendAlmostUsefulNoticeAccountCta(host.scrollAreaEl);

        const {
            primaryBtnEl,
            tertiaryBtnEl,
        } = createNoticeCtaBar(host.footerEl, {
            primaryLabel: 'Continue',
            tertiaryLabel: 'Remind me later',
        })

        /** Moves to syncing in this same notice. Does not mark the welcome series finished. */
        const continueWelcomeSeries = () => {
            showSyncingWelcomeTip(plugin, pagedNotice);
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
                // Same as the other middle pages: hide now, and show the rest next time.
                remindWelcomeLater(pagedNotice);
            });
        }
    });
}

/** Hides the welcome card without marking the series read. */
function remindWelcomeLater(pagedNotice: PagedNotice): void {
    pagedNotice.hide();
}

/** Marks first-run tips finished so a later launch shows version tips instead of welcome again. */
function completeWelcomeTips(plugin: InkPlugin) {
    tipsShowingOrDismissed = false;
    plugin.settings.onboardingTips.welcomeTipRead = true;
    plugin.settings.onboardingTips.lastVersionTipRead = plugin.manifest.version;
    void plugin.saveSettings();
}
