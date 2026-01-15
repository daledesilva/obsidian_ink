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

//////////

function showChanges(plugin: InkPlugin) {

    const noticeBody = createNoticeTemplate(1,3);

    noticeBody.createEl('h1').setText(`Changes in Ink v0.4.0`);
    const listEl = noticeBody.createEl('ul');
    listEl.createEl('li').setText(`Scrolling is now possible while embeds are unlocked.`);
    listEl.createEl('li').setText(`All writing and drawing files are now saved as SVGs. This means they'll work even if Ink is uninstalled and even outside of Obsidian.`);
    listEl.createEl('li').setText(`Reading mode is now fixed (Though the styling is still a work in progress).`);
    listEl.createEl('li').setText(`If you edit an Ink file, any embed of the file will update automatically.`);
    listEl.createEl('li').setText(`Long pages with multiple embeds should now work much more fluidly.`);
    listEl.createEl('li').setText(`Inserting existing embeds will now give you a visual preview of the files.`);
    
    noticeBody.createEl('h2').setText(`Broken`);
    const listEl2 = noticeBody.createEl('ul');
    listEl2.createEl('li').setText(`Drawing with your finger is no longer support for now (To allow for scrolling).`);
    
    const link = noticeBody.createEl('a');
    link.setAttribute('href', 'https://youtu.be/2arL1jh8ihA')
    link.setText(`View release video`);
    // Prevent clicking link from closing notice
    link.onClickEvent( e => e.stopPropagation())
        
    const {
        tertiaryBtnEl
    } = createNoticeCtaBar(noticeBody, {
        tertiaryLabel: 'Dismiss',
    })

    const notice = launchPersistentNotice(noticeBody);

    if(tertiaryBtnEl) {
        tertiaryBtnEl.addEventListener('click', () => {
            notice.hide();
            plugin.settings.onboardingTips.lastVersionTipRead = plugin.manifest.version;
            plugin.saveSettings();
        });
    }
    
}