import * as semVer from 'semver';
import { createInkNoticeTemplate, createNoticeCtaBar, launchPersistentInkNotice } from 'src/components/dom-components/notice-components';
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

    const noticeBody = createInkNoticeTemplate(1,3);
    noticeBody.createEl('h1').setText(`Changes in Ink v0.3.3`);
    const listEl = noticeBody.createEl('ul');
    
    listEl.createEl('li').setText(`Resize drawing embeds (Lock them to save the size).`);
    listEl.createEl('li').setText(`Single click unlock for embeds & multiple embeds unlocked at once.`);
    listEl.createEl('li').setText(`More seamless transitions between locked and unlocked writing embeds.`);
    listEl.createEl('li').setText(`Visible grid in drawing mode (Toggle from dropdown).`);
    listEl.createEl('li').setText(`Drawing stroke/zoom now defaults similar to writing.`);
    listEl.createEl('li').setText(`Insert commands now have temporary icons.`);
    listEl.createEl('li').setText(`Many bug fixes and tweaks under the hood to lay groundwork for future updates and better efficiency.`);
    
    const link = noticeBody.createEl('a');
    link.setAttribute('href', 'https://www.youtube.com/live/_B2a9zTxb28?si=Ovkwao2EW479JRK6')
    link.setText(`View release video`);
    // Prevent clicking link from closing notice
    link.onClickEvent( e => e.stopPropagation())
        
    const {
        tertiaryBtnEl
    } = createNoticeCtaBar(noticeBody, {
        tertiaryLabel: 'Dismiss',
    })

    const notice = launchPersistentInkNotice(noticeBody);

    if(tertiaryBtnEl) {
        tertiaryBtnEl.addEventListener('click', () => {
            notice.hide();
            plugin.settings.onboardingTips.lastVersionTipRead = plugin.manifest.version;
            plugin.saveSettings();
        });
    }
    
}