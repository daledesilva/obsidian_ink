import { setIcon, type ButtonComponent } from 'obsidian';
import { createNoticeBodyCtaRow } from 'src/components/dom-components/notice-components';
import { openAlmostUsefulBrowserUrl } from 'src/logic/almostuseful/almostuseful-login';
import { resolveAlmostUsefulPortalOrigin } from 'src/logic/almostuseful/almostuseful-session';

//////////
//////////

/**
 * Signed-out explanation of handwriting transcription and who runs Almost Useful.
 * Settings only. The welcome transcription page uses its own sentence.
 */
export const almostUsefulLinkAccountDescription =
	'Create and link an Almost Useful account to utilise handwriting transcription. Almost Useful is an accounts portal created by Dale de Silva, the developer of Ink.';

/**
 * Shared CTA chrome for Link account (settings, version notice, and welcome notice).
 * `ddc_ink_primary-btn` is the class high-contrast notice chrome keys off, so every
 * caller picks up inverted fill without a separate selector.
 */
export function applyAlmostUsefulLinkAccountButtonChrome(buttonEl: HTMLElement): void {
	buttonEl.addClass('mod-cta');
	buttonEl.addClass('ddc_ink_primary-btn');
	buttonEl.addClass('ddc_ink_almostuseful-link-account-btn');
	buttonEl.empty();
	const iconEl = buttonEl.createSpan({ cls: 'ddc_ink_almostuseful-link-account-btn-icon' });
	setIcon(iconEl, 'ddc_ink_link_account_user');
	buttonEl.createSpan({
		cls: 'ddc_ink_almostuseful-link-account-btn-label',
		text: 'Link account',
	});
}

/** Outline head/shoulders icon plus label; ButtonComponent#setIcon does not reliably pair with text on CTA buttons. */
export function decorateAlmostUsefulLinkAccountButton(button: ButtonComponent): void {
	button.setCta();
	applyAlmostUsefulLinkAccountButtonChrome(button.buttonEl);
}

/**
 * Centred Link account button and Create account link for the version and welcome notices.
 * Create account always leaves the notice up. The caller decides what Link account does.
 */
export function appendAlmostUsefulNoticeAccountCta(scrollAreaEl: HTMLElement): HTMLButtonElement {
	const bodyCtaRowEl = createNoticeBodyCtaRow(scrollAreaEl);
	bodyCtaRowEl.classList.add('ddc_ink_notice-body-cta-row--stacked');
	bodyCtaRowEl.classList.add('ddc_ink_notice-body-cta-row--centered');
	const linkAccountCtaStackEl = bodyCtaRowEl.createDiv(
		'ddc_ink_almostuseful-link-account-cta-stack ddc_ink_almostuseful-link-account-cta-stack--centered',
	);
	const linkAccountBtnEl = linkAccountCtaStackEl.createEl('button', { type: 'button' });
	applyAlmostUsefulLinkAccountButtonChrome(linkAccountBtnEl);
	const createAccountLinkEl = linkAccountCtaStackEl.createEl('a', {
		cls: 'ddc_ink_tertiary-text-link',
		text: 'Create account',
		href: '#',
	});
	createAccountLinkEl.addEventListener('click', (event) => {
		event.preventDefault();
		// Leave the notice open: the browser overlays Obsidian and the account explanation should still be there.
		openAlmostUsefulBrowserUrl(`${resolveAlmostUsefulPortalOrigin()}/auth/sign-up`);
	});
	return linkAccountBtnEl;
}
