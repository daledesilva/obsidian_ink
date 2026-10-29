import type { StrokeBounds } from './svg-export';

////////
////////

/** Keeps a selection reachable when the user drags it towards or past the page edge. */
export interface SelectionMoveClampOptions {
	/** Canvas size in page units. Drawing canvases are infinite, so pass `null`. */
	pageBounds: { width: number; height: number } | null;
	/** Size of the moved selection (padding included) in page units. */
	selectionSize: { width: number; height: number };
}

/**
 * Limits a requested selection move so the selection cannot be dragged completely out of reach.
 *
 * Why this exists: issue #132 reported that a fragment could be dragged above the top of a writing
 * section and then never be selected or deleted again. Rather than blocking all movement past the
 * edge (which would feel stuck), this keeps a sliver of the selection on the page so it can always
 * be grabbed and moved back.
 */
export function clampSelectionMoveDelta(
	requestedDelta: { x: number; y: number },
	currentBounds: StrokeBounds,
	options: SelectionMoveClampOptions,
): { x: number; y: number } {
	const pageBounds = options.pageBounds;
	if (!pageBounds) return { ...requestedDelta };

	// Keep at least this much of the selection on screen so it stays grabbable.
	const minimumVisiblePageUnits = Math.max(
		8,
		Math.min(options.selectionSize.width, options.selectionSize.height) * 0.25,
	);

	const nextMinX = currentBounds.minX + requestedDelta.x;
	const nextMaxX = currentBounds.maxX + requestedDelta.x;
	const nextMinY = currentBounds.minY + requestedDelta.y;
	const nextMaxY = currentBounds.maxY + requestedDelta.y;

	let x = requestedDelta.x;
	if (nextMaxX < minimumVisiblePageUnits) {
		x = requestedDelta.x + (minimumVisiblePageUnits - nextMaxX);
	} else if (nextMinX > pageBounds.width - minimumVisiblePageUnits) {
		x = requestedDelta.x - (nextMinX - (pageBounds.width - minimumVisiblePageUnits));
	}

	let y = requestedDelta.y;
	// The top edge matters most (#132): a fragment moved above the page start has no way back.
	if (nextMaxY < minimumVisiblePageUnits) {
		y = requestedDelta.y + (minimumVisiblePageUnits - nextMaxY);
	} else if (nextMinY > pageBounds.height - minimumVisiblePageUnits) {
		y = requestedDelta.y - (nextMinY - (pageBounds.height - minimumVisiblePageUnits));
	}

	return { x, y };
}
