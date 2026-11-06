/**
 * Builds the animated body of a settings card.
 * The closing row has no padding of its own, so it can reach zero height.
 */
export function createCollapsibleSectionContent(sectionEl: HTMLElement, contentClass?: string): HTMLElement {
	const collapseEl = sectionEl.createDiv('ddc_ink_controls-collapse');
	const clipEl = collapseEl.createDiv('ddc_ink_controls-collapse-inner');
	let contentClasses = 'ddc_ink_controls-content';
	if (contentClass) contentClasses = `${contentClasses} ${contentClass}`;
	return clipEl.createDiv(contentClasses);
}
