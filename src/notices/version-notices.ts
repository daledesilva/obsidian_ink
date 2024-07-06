import * as semVer from 'semver';
import { createInkNoticeTemplate, createNoticeCtaBar, launchPersistentInkNotice } from 'src/components/dom-components/notice-components';
import InkPlugin from "src/main";

///////////
///////////

export function showVersionNotice(plugin: InkPlugin) {
    const curVersion = plugin.manifest.version;

    const lastVersionTipRead = plugin.settings.onboardingTips.lastVersionTipRead;
    const noLastVersionTipRead = !semVer.valid(lastVersionTipRead)
    const updatedToNewerVersion = noLastVersionTipRead || semVer.gt(curVersion, lastVersionTipRead);

    if(!updatedToNewerVersion) return;

    switch(curVersion) {
        case '0.2.4':   show_0_2_4_changes(plugin); break;
    }
}

//////////

function show_0_2_4_changes_maybe(plugin: InkPlugin) {
    // Bail if it's already been shown enough times
    if(plugin.settings.onboardingTips.welcomeTipRead) return;
    show_0_2_4_changes(plugin);
}

function show_0_2_4_changes(plugin: InkPlugin) {

    const noticeBody = createInkNoticeTemplate(1,3);
    noticeBody.createEl('h1').setText(`Changes in Ink v0.2.4`);
    const listEl = noticeBody.createEl('ul');
    listEl.createEl('li').setText(`Customise the attachment folder in Ink's settings.`);
    listEl.createEl('li').setText(`Remove an embed section through the menu next to the lock button.`);
    listEl.createEl('li').setText(`Additional problem solving tips added to Ink's settings.`);
    listEl.createEl('li').setText(`Drawing embeds enabled by default.`);
    
    const link = noticeBody.createEl('a');
    link.setAttribute('href', 'https://youtube.com/live/nRAABxAG62o')
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