/**
 * Restores Obsidian's `.cm-scroller` or the dedicated writing scroller after FingerBlocker scroll-pin.
 * Mirrors release_0.5 `restoreEmbedScroll()` in tldraw-drawing-editor.
 */
export function restoreEmbedCmScrollerScroll(wrapperEl: HTMLElement | null | undefined): void {
	if (!wrapperEl) return;
	const scroller = wrapperEl.closest<HTMLElement>('.cm-scroller')
		?? wrapperEl.closest<HTMLElement>('.ddc_ink_writing-dedicated-scroller');
	if (!scroller) return;
	scroller.classList.remove('ink-cm-scroller--scroll-pinned');
	// Functional scroll-lock teardown (not theme styling); kept inline to avoid flash on unpin.
	// eslint-disable-next-line obsidianmd/no-static-styles-assignment -- functional pen scroll-lock
	scroller.style.overflow = 'auto';
	window.setTimeout(() => {
		// eslint-disable-next-line obsidianmd/no-static-styles-assignment -- functional pen scroll-lock
		scroller.style.scrollbarColor = 'auto';
	}, 200);
}
