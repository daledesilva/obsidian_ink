//////////
//////////

/** Applied to `.cm-scroller` while pen scroll-lock is active. */
export const INK_CM_SCROLLER_SCROLL_LOCKED_CLASS = 'ink-cm-scroller--scroll-locked';

/**
 * Lifts the pen scroll-lock. Removing the class is the entire teardown: the scroller's own
 * stylesheet decides `overflow` again, so the lock leaves no state behind.
 *
 * Never restore `overflow` inline here. An inline `overflow: auto` outranks the class rule,
 * so from the second stroke onward `.ink-cm-scroller--scroll-locked` stops applying and the
 * note is scrollable under the pen.
 *
 * Never restore `scrollbar-color` either. Declaring that property at all makes Chromium drop
 * Obsidian's `::-webkit-scrollbar` styling and fall back to the native scrollbar width. The
 * note scroller reserves its gutter (`scrollbar-gutter: stable`), so the reserved width
 * changes on every lock/unlock (12px → 15px): the note column narrows and every width-fit ink
 * canvas re-zooms, twice per stroke. See docs/embed-scrolling.md — "scroll-lock must not
 * change layout".
 */
export function clearInkCmScrollerScrollLock(scroller: HTMLElement): void {
	scroller.classList.remove(INK_CM_SCROLLER_SCROLL_LOCKED_CLASS);
}

/** Clears pen scroll-lock state on every `.cm-scroller` in the active document. */
export function clearAllInkCmScrollerScrollLocks(_reason: string): void {
	const scrollers = activeDocument.querySelectorAll<HTMLElement>('.cm-scroller');
	scrollers.forEach((scroller) => {
		if (!scroller.classList.contains(INK_CM_SCROLLER_SCROLL_LOCKED_CLASS)) return;
		clearInkCmScrollerScrollLock(scroller);
	});
}
