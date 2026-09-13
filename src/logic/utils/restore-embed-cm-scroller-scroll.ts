import { clearInkCmScrollerScrollLock_debounced } from 'src/logic/utils/clear-ink-cm-scroller-scroll-lock';

/**
 * Restores Obsidian's `.cm-scroller` or the dedicated writing scroller after FingerBlocker scroll-lock.
 * Mirrors release_0.5 `restoreEmbedScroll()` in tldraw-drawing-editor.
 */
export function restoreEmbedCmScrollerScroll(wrapperEl: HTMLElement | null | undefined): void {
	if (!wrapperEl) return;
	const scroller = wrapperEl.closest<HTMLElement>('.cm-scroller')
		?? wrapperEl.closest<HTMLElement>('.ddc_ink_writing-dedicated-scroller');
	if (!scroller) return;
	clearInkCmScrollerScrollLock_debounced(scroller);
}
