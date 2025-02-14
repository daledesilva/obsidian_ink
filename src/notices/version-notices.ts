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
    noticeBody.createEl('h1').setText(`Changes in Ink v0.3.4`);
    const listEl = noticeBody.createEl('ul');
    
    listEl.createEl('li').setText(`Moved Undo/Redo buttons to prevent accidental back button taps.`);
    listEl.createEl('li').setText(`Added new command icons.`);
    listEl.createEl('li').setText(`Added extra blank lines while writing.`);
    listEl.createEl('li').setText(`Fixed some visual theming bugs.`);
    
    const link = noticeBody.createEl('a');
    link.setAttribute('href', 'https://youtube.com/live/aCMJidESZoE?feature=share')
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