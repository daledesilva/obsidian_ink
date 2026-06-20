import './notice-components.scss';
import { Notice } from "obsidian";

/////////////
/////////////

export interface NoticeTemplate {
    noticeBody: DocumentFragment;
    scrollAreaEl: HTMLDivElement;
    footerEl: HTMLDivElement;
}

export function createNoticeTemplate(noticeNumber?: number, noticeTotal?: number): NoticeTemplate {
    const noticeBody = document.createDocumentFragment();
    const scrollAreaEl = noticeBody.createDiv('ddc_ink_notice-scroll');
    createNoticeLabel(scrollAreaEl, noticeNumber, noticeTotal);
    const footerEl = noticeBody.createDiv('ddc_ink_notice-footer');
    return {
        noticeBody,
        scrollAreaEl,
        footerEl,
    };
}

export function launchPersistentNotice(noticeBody: DocumentFragment) {
    const notice = new Notice(noticeBody, 0);
    notice.noticeEl.classList.add('ddc_ink_notice');
    wireNoticePointerHandling(notice.noticeEl);
    return notice;
}

/** Scroll/footer need pointer-events; stop click bubbling so Obsidian won't dismiss on body clicks. */
function wireNoticePointerHandling(noticeContentEl: HTMLElement) {
    noticeContentEl.querySelector('.ddc_ink_notice-scroll')?.addEventListener('click', (event) => {
        event.stopPropagation();
    });

    noticeContentEl.querySelector('.ddc_ink_notice-footer')?.addEventListener('click', (event) => {
        if (event.target instanceof HTMLElement && event.target.closest('a, button')) {
            return;
        }
        event.stopPropagation();
    });
}

function createNoticeLabel(noticeParent: HTMLElement | DocumentFragment, noticeNumber?: number, noticeTotal?: number): HTMLParagraphElement {
    const labelEl = noticeParent.createEl('p');
    let labelText = `Ink plugin`;
    // if(noticeNumber) labelText += ' ('+noticeNumber;
    // if(noticeTotal) labelText += '/'+noticeTotal;
    // if(noticeNumber) labelText += ')';
    labelEl.setText(labelText);
    labelEl.classList.add('ddc_ink_notice-label');
    return labelEl;
}

export function createNoticeCtaBar(
    footerEl: HTMLElement,
    props: {
        primaryLabel?: string,
        tertiaryLabel?: string,
        footerLink?: { href: string; label: string },
        footerLinks?: { href: string; label: string }[],
    }): {
        ctaBarEl: HTMLDivElement,
        primaryBtnEl: HTMLButtonElement | null,
        tertiaryBtnEl: HTMLButtonElement | null,
        footerLinkEls: HTMLAnchorElement[],
    } {

    let primaryBtnEl: HTMLButtonElement | null = null;
    let tertiaryBtnEl: HTMLButtonElement | null = null;
    const footerLinkEls: HTMLAnchorElement[] = [];

    const links = props.footerLinks ?? (props.footerLink ? [props.footerLink] : []);

    if (links.length > 0) {
        const footerLinksEl = footerEl.createDiv('ddc_ink_notice-footer-links');
        for (const link of links) {
            const footerLinkEl = footerLinksEl.createEl('a');
            footerLinkEl.setAttribute('href', link.href);
            footerLinkEl.setText(link.label);
            footerLinkEl.onClickEvent((event) => event.stopPropagation());
            footerLinkEls.push(footerLinkEl);
        }
    }

    const ctaBarEl = footerEl.createDiv('ddc_ink_notice-cta-bar');

    if (props.primaryLabel) {
        primaryBtnEl = ctaBarEl.createEl('button');
        primaryBtnEl.setText(props.primaryLabel);
        primaryBtnEl.classList.add('ddc_ink_primary-btn')
    }

    if (props.tertiaryLabel) {
        tertiaryBtnEl = ctaBarEl.createEl('button');
        tertiaryBtnEl.setText(props.tertiaryLabel);
        tertiaryBtnEl.classList.add('ddc_ink_tertiary-btn')
    }

    return {
        ctaBarEl,
        primaryBtnEl,
        tertiaryBtnEl,
        footerLinkEls,
    }
}
