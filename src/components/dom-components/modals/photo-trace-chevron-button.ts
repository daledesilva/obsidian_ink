import { setIcon } from 'obsidian';
import './photo-trace-chevron-button.scss';

//////////
//////////

/**
 * Labels a photo-trace footer button with a chevron on one side.
 *
 * Thumbnails and Prev lead with the chevron. Next ends with it. `setIcon` clears
 * its host element, so the icon is drawn into its own span and then ordered
 * around the words instead of replacing them.
 */
export function setPhotoTraceChevronLabel(
	buttonEl: HTMLElement,
	label: string,
	chevronSide: 'start' | 'end',
): void {
	buttonEl.empty();
	buttonEl.addClass('ddc_ink_photo-trace-chevron-btn');
	const labelEl = buttonEl.createSpan({
		text: label,
		cls: 'ddc_ink_photo-trace-chevron-btn__label',
	});
	const iconEl = buttonEl.createSpan({ cls: 'ddc_ink_photo-trace-chevron-btn__icon' });
	// The chevron repeats the words beside it, so a screen reader should not announce it.
	iconEl.setAttribute('aria-hidden', 'true');
	const iconName = chevronSide === 'start' ? 'chevron-left' : 'chevron-right';
	// Restored when a navigation spinner is cleared without closing the dialog.
	iconEl.dataset.restingIcon = iconName;
	setIcon(iconEl, iconName);
	if (chevronSide === 'start') buttonEl.insertBefore(iconEl, labelEl);
}

/**
 * Spins the button that is waiting for the next dialog to be ready.
 *
 * The chevron (or the pencil on a thumbnail) is swapped for a loader and put back
 * if the wait fails and the dialog stays open. A button with no icon of its own,
 * such as Convert all, gets a loader in front of its label.
 */
export function setPhotoTraceButtonBusy(buttonEl: HTMLElement, isBusy: boolean): void {
	buttonEl.toggleClass('is-busy', isBusy);
	if (isBusy) buttonEl.setAttribute('aria-busy', 'true');
	else buttonEl.removeAttribute('aria-busy');

	const iconEl = buttonEl.querySelector(
		'.ddc_ink_photo-trace-chevron-btn__icon, .ddc_ink_writing-photo-batch-icon',
	);
	if (iconEl instanceof HTMLElement) {
		const restingIcon = iconEl.dataset.restingIcon;
		if (isBusy) {
			setIcon(iconEl, 'loader-2');
			return;
		}
		if (restingIcon) setIcon(iconEl, restingIcon);
		return;
	}

	const existingSpinner = buttonEl.querySelector('.ddc_ink_photo-trace-btn__spinner');
	if (!isBusy) {
		existingSpinner?.remove();
		return;
	}
	if (existingSpinner) return;
	const spinnerEl = buttonEl.createSpan({ cls: 'ddc_ink_photo-trace-btn__spinner' });
	spinnerEl.setAttribute('aria-hidden', 'true');
	buttonEl.insertBefore(spinnerEl, buttonEl.firstChild);
	setIcon(spinnerEl, 'loader-2');
}
