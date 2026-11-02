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
	setIcon(iconEl, iconName);
	if (chevronSide === 'start') buttonEl.insertBefore(iconEl, labelEl);
}
