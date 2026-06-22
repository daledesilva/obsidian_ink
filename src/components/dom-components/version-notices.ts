import * as semVer from 'semver';
import { createNoticeTemplate, createNoticeCtaBar, launchPersistentNotice } from 'src/components/dom-components/notice-components';
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

    const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate(1,3);

    // scrollAreaEl.createEl('h1').setText(`Changes in Ink v0.4.0`);
    // const listEl = scrollAreaEl.createEl('ul');
    // listEl.createEl('li').setText(`Scrolling is now possible while embeds are unlocked.`);
    // listEl.createEl('li').setText(`All writing and drawing files are now saved as svgs. This means they'll work even if ink is uninstalled and even outside of Obsidian.`);
    // listEl.createEl('li').setText(`Reading mode is now fixed (though the styling is still a work in progress).`);
    // listEl.createEl('li').setText(`If you edit an ink file, any embed of the file will update automatically.`);
    // listEl.createEl('li').setText(`Long pages with multiple embeds should now work much more fluidly.`);
    // listEl.createEl('li').setText(`Inserting existing embeds will now give you a visual preview of the files.`);

    // scrollAreaEl.createEl('h1').setText(`Changes in Ink v0.5.0`);
    // const listEl = scrollAreaEl.createEl('ul');
    // listEl.createEl('li').setText(`Files now saved in a new file format.`);
    // listEl.createEl('li').setText(`Save your drawing embeds with specific framing: Two fingers or right mouse button to reframe. Cmd + right mouse button to zoom, or Cmd + scroll wheel.`);
    // listEl.createEl('li').setText(`Frame the same file differently across multiple embeds.`);
    // listEl.createEl('li').setText(`Full screen writing and drawing is now fully supported.`);
    // listEl.createEl('li').setText(`Unified undo allows Cmd+Z across embeds and your Markdown note.`);
    // listEl.createEl('li').setText(`Manual smoothing & pressure selection.`);
    // listEl.createEl('li').setText(`Easier copy and paste.`);
    // listEl.createEl('li').setText(`Customisable line height.`);
    // listEl.createEl('li').setText(`Dominant hand setting.`);
    // listEl.createEl('li').setText(`Hold ⌘/Ctrl to switch to eraser temporarily.`);
        
    // scrollAreaEl.createEl('h2').setText(`Note`);
    // const listEl2 = scrollAreaEl.createEl('ul');
    // listEl2.createEl('li').setText(`Existing Ink files will not convert to the new format in this release. This will be added in a later update.`);


    scrollAreaEl.createEl('h1').setText(`Changes in Ink v0.5.1`);
    const listEl = scrollAreaEl.createEl('ul');
    listEl.createEl('li').setText(`Added ability to draw with fingers (Turn on in settings).`);
    listEl.createEl('li').setText(`Added default drawing grid setting.`);
    listEl.createEl('li').setText(`Added ability to right click on locked embeds to copy or delete.`);
    listEl.createEl('li').setText(`Reduced minimum drawing embed size.`);
    listEl.createEl('li').setText(`Changed shortcut for eraser to Cmd/Ctrl instead of middle mouse button.`);
    listEl.createEl('li').setText(`Fixed colour theming in reading mode layout.`);
    listEl.createEl('li').setText(`Fixed reading mode and PDF export sizing.`);
    listEl.createEl('li').setText(`Fixed trackpad zooming direction.`);
    listEl.createEl('li').setText(`Fixed ability to draw slowly at high zoom levels.`);
        
    scrollAreaEl.createEl('h2').setText(`Note`);
    const listEl2 = scrollAreaEl.createEl('ul');
    listEl2.createEl('li').setText(`Existing Ink files will not convert to the new format in this release. This will be added in a later update.`);

    const {
        tertiaryBtnEl
    } = createNoticeCtaBar(footerEl, {
        footerLink: {
            href: 'https://youtu.be/ysE0eUqUGGE',
            label: 'View feature demos',
        },
        tertiaryLabel: 'Dismiss',
    })

    const notice = launchPersistentNotice(noticeBody);

    if(tertiaryBtnEl) {
        tertiaryBtnEl.addEventListener('click', () => {
            notice.hide();
            plugin.settings.onboardingTips.lastVersionTipRead = plugin.manifest.version;
            void plugin.saveSettings();
        });
    }
    
}
