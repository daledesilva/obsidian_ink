import { setIcon, type ButtonComponent } from 'obsidian';

/**
 * Shared CTA chrome for Link account (settings + version notice).
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
