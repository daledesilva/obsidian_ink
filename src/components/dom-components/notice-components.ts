import './notice-components.scss';
import { Notice } from "obsidian";

/////////////
/////////////

export function createInkNoticeTemplate(noticeNumber?: number, noticeTotal?: number): DocumentFragment {
    const noticeBody = document.createDocumentFragment();
    createNoticeLabel(noticeBody, noticeNumber, noticeTotal);
    return noticeBody;
}

export function launchPersistentInkNotice(noticeBody: DocumentFragment) {
    const notice = new Notice(noticeBody, 0);
    notice.noticeEl.classList.add('ddc_ink_notice');
    notice.noticeEl.style.pointerEvents = "none";
    return notice;
}

function createNoticeLabel(noticeBody: DocumentFragment, noticeNumber?: number, noticeTotal?: number): HTMLParagraphElement {
    const labelEl = noticeBody.createEl('p');
    let labelText = `Ink plugin`;
    // if(noticeNumber) labelText += ' ('+noticeNumber;
    // if(noticeTotal) labelText += '/'+noticeTotal;
    // if(noticeNumber) labelText += ')';
    labelEl.setText(labelText);
    labelEl.classList.add('ddc_ink_notice-label');
    return labelEl;
}

export function createNoticeCtaBar(
    noticeBody: DocumentFragment,
    props: {
        primaryLabel?: string,
        tertiaryLabel?:string
    }): {
        ctaBarEl: HTMLDivElement,
        primaryBtnEl: HTMLButtonElement | null,
        tertiaryBtnEl: HTMLButtonElement | null,
    } {
    
    let primaryBtnEl: HTMLButtonElement | null = null;
    let tertiaryBtnEl: HTMLButtonElement | null = null;
        
    const ctaBarEl = noticeBody.createDiv('ddc_ink_notice-cta-bar');

    if(props.primaryLabel) {
        primaryBtnEl = ctaBarEl.createEl('button');
        primaryBtnEl.setText(props.primaryLabel);
        primaryBtnEl.classList.add('ddc_ink_primary-btn')
        primaryBtnEl.style.pointerEvents = "all";
    }

    if(props.tertiaryLabel) {
        tertiaryBtnEl = ctaBarEl.createEl('button');
        tertiaryBtnEl.setText(props.tertiaryLabel);
        tertiaryBtnEl.classList.add('ddc_ink_tertiary-btn')
        tertiaryBtnEl.style.pointerEvents = "all";
    }

    return {
        ctaBarEl,
        primaryBtnEl,
        tertiaryBtnEl,
    }
}
