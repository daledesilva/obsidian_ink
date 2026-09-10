//////////
//////////

/** Applied to `.cm-scroller` while pen scroll-lock is active (matches prior overflow: hidden behaviour). */
export const INK_CM_SCROLLER_SCROLL_LOCKED_CLASS = 'ink-cm-scroller--scroll-locked';

// Delay matches FingerBlocker unlockScroll: immediate overflow, deferred scrollbar paint.
const INK_CM_SCROLLER_SCROLLBAR_RESTORE_DELAY_MS = 200;

/**
 * Restores note scroller overflow after pen scroll-lock. Uses Obsidian `setCssProps` (required by
 * `obsidianmd/no-static-styles-assignment`) instead of literal `style.*` writes; delayed
 * `scrollbarColor` avoids a visible flash when the lock lifts.
 */
export function clearInkCmScrollerScrollLock_debounced(scroller: HTMLElement): void {
	scroller.classList.remove(INK_CM_SCROLLER_SCROLL_LOCKED_CLASS);
	scroller.setCssProps({ overflow: 'auto' });
	window.setTimeout(() => {
		scroller.setCssProps({ scrollbarColor: 'auto' });
	}, INK_CM_SCROLLER_SCROLLBAR_RESTORE_DELAY_MS);
}

/**
 * Emergency scroll-lock cleanup when `pointerup` may never arrive (panel open, page hide).
 * Skips delayed scrollbar restore so every locked scroller unblocks immediately.
 */
export function clearInkCmScrollerScrollLockOverflowOnly(scroller: HTMLElement): void {
	scroller.classList.remove(INK_CM_SCROLLER_SCROLL_LOCKED_CLASS);
	scroller.setCssProps({ overflow: 'auto' });
}

/** Clears pen scroll-lock state on every `.cm-scroller` in the active document. */
export function clearAllInkCmScrollerScrollLocks(_reason: string): void {
	const scrollers = activeDocument.querySelectorAll<HTMLElement>('.cm-scroller');
	scrollers.forEach((scroller) => {
		if (!scroller.classList.contains(INK_CM_SCROLLER_SCROLL_LOCKED_CLASS)) return;
		clearInkCmScrollerScrollLockOverflowOnly(scroller);
	});
}
