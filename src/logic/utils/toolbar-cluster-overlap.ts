//////////
//////////

/** Ignore clusters that are hidden or have not laid out yet. */
export function isVisibleToolbarClusterRect(rect: DOMRect): boolean {
	return rect.width > 0 && rect.height > 0;
}

/**
 * True when two toolbar clusters are closer than `gapPx` horizontally.
 * `gapPx` is minimum required clearance between edges (not overlap area).
 */
export function horizontalRectsOverlap(a: DOMRect, b: DOMRect, gapPx: number): boolean {
	return !(a.right + gapPx <= b.left || a.left >= b.right + gapPx);
}

export interface DrawingToolbarClusterRects {
	left: DOMRect | null;
	center: DOMRect;
	right: DOMRect | null;
}

/** True when the centre cluster lacks horizontal clearance from the left and/or right cluster. */
export function drawingToolbarClustersOverlap(
	clusters: DrawingToolbarClusterRects,
	gapPx: number,
): boolean {
	const { left, center, right } = clusters;
	if (!isVisibleToolbarClusterRect(center)) return false;

	if (left && isVisibleToolbarClusterRect(left) && horizontalRectsOverlap(left, center, gapPx)) {
		return true;
	}

	if (right && isVisibleToolbarClusterRect(right) && horizontalRectsOverlap(center, right, gapPx)) {
		return true;
	}

	return false;
}
