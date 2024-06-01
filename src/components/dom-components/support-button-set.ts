import "./support-button-set.scss";
import { Setting } from "obsidian";
// import "../../graphics/social-icons/bluesky.jsx";
// import "../../graphics/social-icons/mastodon.jsx";
// import "../../graphics/social-icons/twitter.jsx";
// import "../../graphics/social-icons/threads.jsx";

///////////
///////////

export function createSupportButtonSet(containerEl: DocumentFragment | HTMLElement) {
    const supportBarEl = containerEl.createDiv('ddc_ink_support-btn-set');
    const settingEl = new Setting(supportBarEl);
    settingEl.infoEl.createEl('p').setText('Like Ink?');
    settingEl.addButton(btn => {
        btn.setClass('ddc_ink_secondary-button');
        btn.setTooltip('Bluesky');
        btn.setIcon('bluesky');
        btn.onClick( (e) => {
            window.open('https://bsky.app/profile/daledesilva.bsky.social', '_blank');
        })
    })
    settingEl.addButton(btn => {
        btn.setClass('ddc_ink_secondary-button');
        btn.setTooltip('Mastodon');
        btn.setIcon('mastodon');
        btn.onClick( (e) => {
            window.open('https://indieweb.social/@daledesilva', '_blank');
        })
    })
    settingEl.addButton(btn => {
        btn.setClass('ddc_ink_secondary-button');
        btn.setTooltip('X (Twitter)');
        btn.setIcon('twitter');
        btn.onClick( (e) => {
            window.open('https://twitter.com/daledesilva', '_blank');
        })
    })
    settingEl.addButton(btn => {
        btn.setClass('ddc_ink_primary-button');
        btn.setTooltip('Threads');
        btn.setIcon('threads');
        btn.onClick( (e) => {
            window.open('https://www.threads.net/@daledesilva', '_blank');
        })
    })
    settingEl.addButton(btn => {
        btn.setClass('ddc_ink_primary-button');
        btn.setTooltip('Support developer');
        btn.setIcon('heart');
        btn.onClick( (e) => {
            window.open('https://ko-fi.com/N4N3JLUCW', '_blank');
        })
    })
}
