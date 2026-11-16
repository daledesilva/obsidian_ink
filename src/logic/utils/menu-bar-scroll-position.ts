////////
////////

/** Geometry the menu bar needs to decide whether it should stay pinned to the note viewport. */
export interface MenuBarScrollGeometry {
	/** Bar height in screen pixels. */
	menuBarHeightPx: number;
	/** Embed (the bar's parent) height in screen pixels. */
	embedHeightPx: number;
	/** Embed top relative to the scroller top, before pinning correction. */
	embedOffsetTopPx: number;
	/** Scroller height in screen pixels. */
	scrollAreaHeightPx: number;
}

/** Where a menu bar should sit while the note scrolls. `null` means "use the stylesheet default". */
export type MenuBarScrollPlacement =
	| { edge: 'top'; offsetPx: number }
	| { edge: 'bottom'; offsetPx: number };

/**
 * Computes the sticky `top` offset for a menu bar pinned above an embed.
 *
 * Why this exists: the previous inline version read `menuActive` from a closure and relied on a
 * listener that was never removed, so several stale handlers could each write a different `top`.
 * That is how the menu ended up painted inside the drawing area instead of above it (#124).
 * Keeping the maths pure makes the behaviour reviewable and testable.
 */
export function computePrimaryMenuBarTop(
	geometry: MenuBarScrollGeometry,
	isMenuTranslatedOut: boolean,
): number | null {
	const pinnedOffsetTopPx = isMenuTranslatedOut
		? geometry.embedOffsetTopPx - geometry.menuBarHeightPx
		: geometry.embedOffsetTopPx;

	const isEmbedBottomAboveScrollerTop = pinnedOffsetTopPx + geometry.embedHeightPx < 0;
	if (isEmbedBottomAboveScrollerTop) {
		// Do not let the bar stick past the bottom edge of the embed.
		return geometry.embedHeightPx;
	}

	if (pinnedOffsetTopPx < 0) {
		// Top edge is off screen: pin the bar to the top of the scroller.
		return -pinnedOffsetTopPx;
	}

	return null;
}

/**
 * Computes the sticky `bottom` offset for a menu bar pinned below an embed.
 *
 * The bar is only translated by 50% in CSS, hence the half-height corrections.
 */
export function computeSecondaryMenuBarBottom(
	geometry: MenuBarScrollGeometry,
	isMenuTranslatedOut: boolean,
): number | null {
	const pinnedOffsetTopPx = isMenuTranslatedOut
		? geometry.embedOffsetTopPx + geometry.menuBarHeightPx
		: geometry.embedOffsetTopPx;

	if (pinnedOffsetTopPx > geometry.scrollAreaHeightPx) {
		// Do not let the bar stick past the bottom edge of the embed.
		return geometry.embedHeightPx;
	}

	const halfMenuBarHeight = geometry.menuBarHeightPx / 2;
	const embedBottomPastScrollerBottom =
		pinnedOffsetTopPx + geometry.embedHeightPx - halfMenuBarHeight > geometry.scrollAreaHeightPx;
	if (embedBottomPastScrollerBottom) {
		return pinnedOffsetTopPx + geometry.embedHeightPx - geometry.scrollAreaHeightPx - halfMenuBarHeight;
	}

	return null;
}
