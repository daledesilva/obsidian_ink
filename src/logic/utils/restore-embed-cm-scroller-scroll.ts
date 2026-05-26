/**
 * Restores Obsidian's `.cm-scroller` after FingerBlocker scroll-pin or embed pan/zoom.
 * Mirrors release_0.5 `restoreEmbedScroll()` in tldraw-drawing-editor.
 */
export function restoreEmbedCmScrollerScroll(wrapperEl: HTMLElement | null | undefined): void {
	if (!wrapperEl) return;
	const cmScroller = wrapperEl.closest<HTMLElement>('.cm-scroller');
	if (!cmScroller) return;
	cmScroller.classList.remove('ink-cm-scroller--scroll-pinned');
	cmScroller.style.overflow = 'auto';
	window.setTimeout(() => {
		cmScroller.style.scrollbarColor = 'auto';
	}, 200);
}
