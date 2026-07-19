import * as semVer from 'semver';
import { createNoticeTemplate, createNoticeCtaBar, createNoticeInlineQuote, launchPersistentNotice } from 'src/components/dom-components/notice-components';
import InkPlugin from "src/main";

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

    scrollAreaEl.createEl('h1').setText(`Additions in Ink v0.5.4`);

    const addedListEl = scrollAreaEl.createEl('ul');
    addedListEl.createEl('li').setText(`Full screen writing and drawing is now fully supported.`);
    addedListEl.createEl('li').setText(`Frame the same drawing differently across multiple embeds.`);
    const undoLi = addedListEl.createEl('li');
    undoLi.appendText(`Unified undo allows `);
    createNoticeInlineQuote(undoLi, 'Cmd+Z');
    undoLi.appendText(` across embeds and your Markdown note.`);
    addedListEl.createEl('li').setText(`Manual smoothing & pressure selection.`);
    const eraserHoldLi = addedListEl.createEl('li');
    eraserHoldLi.appendText(`Hold `);
    createNoticeInlineQuote(eraserHoldLi, 'Cmd');
    eraserHoldLi.appendText(` to switch to eraser temporarily.`);
    addedListEl.createEl('li').setText(`Ability to draw with fingers (Activate in settings).`);
    addedListEl.createEl('li').setText(`And more...`);

    const {
        primaryBtnEl,
    } = createNoticeCtaBar(footerEl, {
        footerLink: {
            href: 'https://youtu.be/plrnx7J_Avc',
            label: 'View feature demos',
        },
        primaryLabel: 'Continue',
    })

    const notice = launchPersistentNotice(noticeBody);

    if (primaryBtnEl) {
        primaryBtnEl.addEventListener('click', () => {
            notice.hide();
            showChangesPageTwo(plugin);
        });
    }
}

function showChangesPageTwo(plugin: InkPlugin) {
    const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate(2, 2);

    scrollAreaEl.createEl('h1').setText(`Changes in Ink v0.5.4`);

    scrollAreaEl.createEl('h2').setText(`Changed`);
    const changedListEl = scrollAreaEl.createEl('ul');
    changedListEl.createEl('li').setText(`Files now save in a new file format.`);
    changedListEl.createEl('li').setText(`Reduced minimum drawing embed size.`);
    const eraserShortcutLi = changedListEl.createEl('li');
    eraserShortcutLi.appendText(`Eraser shortcut is now `);
    createNoticeInlineQuote(eraserShortcutLi, 'Cmd');
    eraserShortcutLi.appendText(` instead of middle mouse button.`);

    scrollAreaEl.createEl('h2').setText(`Fixed`);
    const fixedListEl = scrollAreaEl.createEl('ul');
    fixedListEl.createEl('li').setText(`Colour theming in reading mode layout.`);
    fixedListEl.createEl('li').setText(`Reading mode and PDF export sizing.`);
    fixedListEl.createEl('li').setText(`Ability to draw slowly at high zoom levels.`);

    const {
        tertiaryBtnEl
    } = createNoticeCtaBar(footerEl, {
        footerLink: {
            href: 'https://youtu.be/plrnx7J_Avc',
            label: 'View feature demos',
        },
        tertiaryLabel: 'Dismiss',
    })

    const notice = launchPersistentNotice(noticeBody);

    if (tertiaryBtnEl) {
        tertiaryBtnEl.addEventListener('click', () => {
            notice.hide();
            plugin.settings.onboardingTips.lastVersionTipRead = plugin.manifest.version;
            void plugin.saveSettings();
        });
    }
}
