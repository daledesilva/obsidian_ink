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
    const noticeBody = createFragment();
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
    // Stay on the focused window. Moving the card to the main workspace window makes a click
    // there raise that window and send a separate Settings window to the background.
    const notice = new Notice(noticeBody, 0);
    // Pinned `obsidian` typings still use noticeEl; messageEl is the 1.13 rename.
    notice.noticeEl.classList.add('ddc_ink_notice');
    wireNoticePointerHandling(notice.noticeEl);
    return notice;
}

export interface PagedNoticeHost {
    scrollAreaEl: HTMLElement;
    footerEl: HTMLElement;
}

export interface PagedNotice {
    notice: Notice;
    setPage: (renderPage: (host: PagedNoticeHost) => void) => void;
    hide: () => void;
}

/**
 * Opens one persistent notice whose body and footer can be replaced in place.
 * A new Obsidian notice would jump ahead of anything else already on screen.
 */
export function launchPagedNotice(): PagedNotice {
    const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate();
    // The "Ink plugin" label stays put. Only this slot is swapped between pages.
    const pageEl = scrollAreaEl.createDiv('ddc_ink_notice-page');
    const notice = launchPersistentNotice(noticeBody);
    const host: PagedNoticeHost = {
        scrollAreaEl: pageEl,
        footerEl,
    };

    const hide = () => {
        notice.hide();
    };

    let hasRenderedPage = false;
    let queuedRender: ((pageHost: PagedNoticeHost) => void) | null = null;
    let pagingTimer = 0;

    const paintPage = (renderPage: (pageHost: PagedNoticeHost) => void) => {
        pageEl.empty();
        footerEl.empty();
        renderPage(host);
        scrollAreaEl.scrollTop = 0;
    };

    /** Swaps in the queued page and lets the shell height ease to the new content. */
    const finishPaging = () => {
        const renderPage = queuedRender;
        queuedRender = null;
        pagingTimer = 0;
        if (!renderPage) return;
        const shellEl = outerNoticeShell(notice);
        const fromHeight = shellEl.offsetHeight;
        paintPage(renderPage);
        transitionShellHeight(shellEl, fromHeight);
        notice.noticeEl.classList.remove('is-paging-out');
    };

    const setPage = (renderPage: (pageHost: PagedNoticeHost) => void) => {
        if (!hasRenderedPage) {
            // The notice itself is still sliding in. Don't also fade the first page.
            hasRenderedPage = true;
            paintPage(renderPage);
            releaseStaleNoticeHeight(notice);
            return;
        }
        queuedRender = renderPage;
        const motionMs = pageMotionMs(notice.noticeEl);
        if (motionMs === 0) {
            finishPaging();
            return;
        }
        // Fade the current page out, then reveal the next one in the same card.
        notice.noticeEl.classList.add('is-paging-out');
        if (pagingTimer) return;
        pagingTimer = notice.noticeEl.win.setTimeout(finishPaging, motionMs);
    };

    return {
        notice,
        setPage,
        hide,
    };
}

/** The outer Obsidian notice, which is what actually grows and shrinks. */
function outerNoticeShell(notice: Notice): HTMLElement {
    const shellEl = notice.noticeEl.closest('.notice');
    if (shellEl instanceof HTMLElement) return shellEl;
    return notice.noticeEl;
}

/** Clears a pixel height so the next page can shrink or grow with its content. */
function releaseStaleNoticeHeight(notice: Notice): void {
    const shellEl = outerNoticeShell(notice);
    shellEl.style.removeProperty('height');
    notice.noticeEl.style.removeProperty('height');
    // Read layout after the clear so fit-content measures this page, not the previous one.
    void shellEl.offsetHeight;
}

let noticeHeightGeneration = 0;

/**
 * Eases the card from the previous page's height to the new one.
 * Fit-content is forced with !important, so the animated height has to be too.
 */
function transitionShellHeight(shellEl: HTMLElement, fromHeight: number): void {
    const generation = ++noticeHeightGeneration;
    shellEl.style.setProperty('height', 'fit-content', 'important');
    const toHeight = shellEl.offsetHeight;
    const motionMs = pageMotionMs(shellEl);
    if (fromHeight === toHeight || motionMs === 0) {
        shellEl.style.removeProperty('height');
        return;
    }
    shellEl.style.setProperty('height', `${fromHeight}px`, 'important');
    void shellEl.offsetHeight;
    shellEl.style.setProperty('height', `${toHeight}px`, 'important');
    const clearHeight = () => {
        if (generation !== noticeHeightGeneration) return;
        shellEl.style.removeProperty('height');
        shellEl.removeEventListener('transitionend', onHeightEnd);
    };
    const onHeightEnd = (event: TransitionEvent) => {
        if (event.propertyName !== 'height') return;
        clearHeight();
    };
    shellEl.addEventListener('transitionend', onHeightEnd);
    // Drop the locked height even if the transition is interrupted.
    shellEl.win.setTimeout(clearHeight, motionMs + 80);
}

/** Matches `--ddc_ink_notice-page-ms`. Zero when the reader prefers reduced motion. */
function pageMotionMs(noticeEl: HTMLElement): number {
    const noticeWindow = noticeEl.win;
    const reduceMotion = noticeWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return 0;
    const rawDuration = getComputedStyle(noticeEl).getPropertyValue('--ddc_ink_notice-page-ms').trim();
    const durationValue = Number.parseFloat(rawDuration);
    if (Number.isNaN(durationValue)) return 0;
    if (rawDuration.endsWith('ms')) return durationValue;
    return durationValue * 1000;
}

/**
 * Keeps clicks inside the card.
 * Obsidian hides a notice when a click reaches `.notice`, which would slide the whole card away on Read now.
 */
function wireNoticePointerHandling(noticeContentEl: HTMLElement) {
    noticeContentEl.addEventListener('click', (event) => {
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

/** Row for one or more primary CTAs in notice scroll content (not the footer bar). */
export function createNoticeBodyCtaRow(scrollAreaEl: HTMLElement): HTMLDivElement {
	return scrollAreaEl.createDiv('ddc_ink_notice-body-cta-row');
}

/** Primary CTA button inside a notice body CTA row. */
export function createNoticeBodyCtaButton(
	parentEl: HTMLElement,
	label: string,
): HTMLButtonElement {
	const buttonEl = parentEl.createEl('button');
	buttonEl.setText(label);
	buttonEl.classList.add('ddc_ink_primary-btn');
	return buttonEl;
}

/** Inline twin of notice blockquotes — same accent chip look for shortcuts/commands inside a sentence. */
export function createNoticeInlineQuote(parentEl: HTMLElement, text: string): HTMLQuoteElement {
    return parentEl.createEl('q', {
        cls: 'ddc_ink_notice-inline-quote',
        text,
    });
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
