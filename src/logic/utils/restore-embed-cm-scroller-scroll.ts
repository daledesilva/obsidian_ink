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
	scroller.style.overflow = 'auto';
	window.setTimeout(() => {
		scroller.style.scrollbarColor = 'auto';
	}, 200);
}
