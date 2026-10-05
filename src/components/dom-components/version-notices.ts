import * as semVer from 'semver';
import {
    createNoticeBodyCtaButton,
    createNoticeBodyCtaRow,
    createNoticeCtaBar,
    createNoticeTemplate,
    launchPersistentNotice,
} from 'src/components/dom-components/notice-components';
import { ALMOSTUSEFUL_PORTAL_ORIGIN } from 'src/logic/almostuseful/almostuseful-constants';
import { openAlmostUsefulBrowserUrl } from 'src/logic/almostuseful/almostuseful-login';
import InkPlugin from "src/main";
import { openInkSettingsTab } from './tabs/settings-tab/settings-tab';

///////////
///////////

export function showVersionNotice(plugin: InkPlugin) {
    let curVersion = plugin.manifest.version;
    if (curVersion.endsWith('-beta')) {
        curVersion = curVersion.replace('-beta', '');
    }

    const lastVersionTipRead = plugin.settings.onboardingTips.lastVersionTipRead;
    const noLastVersionTipRead = !semVer.valid(lastVersionTipRead)
    const updatedToNewerVersion = noLastVersionTipRead || semVer.gt(curVersion, lastVersionTipRead);

    if(updatedToNewerVersion) {
        showChanges(plugin);
    }
}

export function showRecentChanges(plugin: InkPlugin) {
    showChanges(plugin);
}

//////////

function showChanges(plugin: InkPlugin) {
    const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate(1, 2);

    scrollAreaEl.createEl('h1').setText(`Changes in Ink v0.6`);

    scrollAreaEl.createEl('h2').setText('Handwriting transcriptions (OCR)');
    const inviteOnlyParagraphEl = scrollAreaEl.createEl('p');
    inviteOnlyParagraphEl.appendText('This requires an ');
    inviteOnlyParagraphEl.createEl('strong').setText('Almost Useful');
    inviteOnlyParagraphEl.appendText(' account for processing and is currently invite only.');

    const bodyCtaRowEl = createNoticeBodyCtaRow(scrollAreaEl);
    const joinWaitlistBtnEl = createNoticeBodyCtaButton(bodyCtaRowEl, 'Join the waitlist');
    const logInBtnEl = createNoticeBodyCtaButton(bodyCtaRowEl, 'Log in');

    const { tertiaryBtnEl } = createNoticeCtaBar(footerEl, {
        footerLink: {
            href: 'https://youtu.be/ujXUf8ighSM',
            label: 'View feature demos',
        },
        tertiaryLabel: 'Dismiss',
    });

    const notice = launchPersistentNotice(noticeBody);

    // Body CTAs stay open so invite copy remains after the browser or Settings backgrounds Obsidian.
    joinWaitlistBtnEl.addEventListener('click', () => {
        openAlmostUsefulBrowserUrl(ALMOSTUSEFUL_PORTAL_ORIGIN);
    });

    logInBtnEl.addEventListener('click', () => {
        openInkSettingsTab(plugin);
    });

    if (tertiaryBtnEl) {
        tertiaryBtnEl.addEventListener('click', () => {
            notice.hide();
            plugin.settings.onboardingTips.lastVersionTipRead = plugin.manifest.version;
            void plugin.saveSettings();
        });
    }
}

// function showChangesPageTwo(plugin: InkPlugin) {
//     const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate(2, 2);

//     scrollAreaEl.createEl('h1').setText(`Changes in Ink v0.5.7`);

//     scrollAreaEl.createEl('h2').setText(`Changed`);
//     const changedListEl = scrollAreaEl.createEl('ul');
//     changedListEl.createEl('li').setText(`Files now save in a new file format.`);
//     changedListEl.createEl('li').setText(`Reduced minimum drawing embed size.`);
//     const eraserShortcutLi = changedListEl.createEl('li');
//     eraserShortcutLi.appendText(`Eraser shortcut is now `);
//     createNoticeInlineQuote(eraserShortcutLi, 'Cmd');
//     eraserShortcutLi.appendText(` instead of middle mouse button.`);

//     scrollAreaEl.createEl('h2').setText(`Fixed`);
//     const fixedListEl = scrollAreaEl.createEl('ul');
//     fixedListEl.createEl('li').setText(`Colour theming in reading mode layout.`);
//     fixedListEl.createEl('li').setText(`Reading mode and PDF export sizing.`);
//     fixedListEl.createEl('li').setText(`Ability to draw slowly at high zoom levels.`);

//     const {
//         tertiaryBtnEl
//     } = createNoticeCtaBar(footerEl, {
//         footerLink: {
//             href: 'https://youtu.be/plrnx7J_Avc',
//             label: 'View feature demos',
//         },
//         tertiaryLabel: 'Dismiss',
//     })

//     const notice = launchPersistentNotice(noticeBody);

//     if (tertiaryBtnEl) {
//         tertiaryBtnEl.addEventListener('click', () => {
//             notice.hide();
//             plugin.settings.onboardingTips.lastVersionTipRead = plugin.manifest.version;
//             void plugin.saveSettings();
//         });
//     }
// }
