import type { DominantHand } from 'src/types/plugin-settings_0_5_0';
import type { InkStroke } from './types';
import { computeStrokesBounds, type StrokeBounds } from './svg-export';

///////////////////////////
///////////////////////////

/** Screen pixels of inset between ink and the selection chrome (÷ zoom → page units). */
export const SELECTION_BOUNDS_PADDING_SCREEN_PX = 10;

/** Screen-pixel corner radius on the selection chrome rect (÷ zoom → page units). */
export const SELECTION_BOUNDS_CORNER_RADIUS_SCREEN_PX = 10;

/** Padding around stroke bounds in page units for the current camera zoom. */
export function selectionBoundsPaddingPageUnits(cameraZoom: number): number {
	return SELECTION_BOUNDS_PADDING_SCREEN_PX / cameraZoom;
}

/** Screen pixels for resize handle hit radius (converted to page units via zoom). */
export const SELECTION_HANDLE_HIT_RADIUS_SCREEN_PX = 10;

/** Screen pixels offset of the rotate affordance outside the bbox corner. */
export const SELECTION_ROTATE_HANDLE_OFFSET_SCREEN_PX = 14;

export type SelectionHandleKind = 'resize' | 'rotate';

export interface SelectionHandlePositions {
	resize: { x: number; y: number };
	rotate: { x: number; y: number };
	pivot: { x: number; y: number };
}

/** Padded axis-aligned bounds for the current selection. */
export function getSelectionBoundsForStrokes(
	strokes: InkStroke[],
	paddingPageUnits: number,
): StrokeBounds | null {
	if (strokes.length === 0) return null;
	const tight = computeStrokesBounds(strokes);
	if (!Number.isFinite(tight.minX)) return null;
	return {
		minX: tight.minX - paddingPageUnits,
		minY: tight.minY - paddingPageUnits,
		maxX: tight.maxX + paddingPageUnits,
		maxY: tight.maxY + paddingPageUnits,
		width: tight.width + paddingPageUnits * 2,
		height: tight.height + paddingPageUnits * 2,
	};
}

/** True when a page-space point lies inside the selection rectangle (inclusive). */
export function isPagePointInBounds(
	point: { x: number; y: number },
	bounds: StrokeBounds,
): boolean {
	return (
		point.x >= bounds.minX
		&& point.x <= bounds.maxX
		&& point.y >= bounds.minY
		&& point.y <= bounds.maxY
	);
}

/** Center of a bounds rect in page space. */
export function selectionBoundsCenter(bounds: StrokeBounds): { x: number; y: number } {
	return {
		x: (bounds.minX + bounds.maxX) / 2,
		y: (bounds.minY + bounds.maxY) / 2,
	};
}

/** Resize and rotate handle anchors in page space (rotate sits outside the bbox corner). */
export function getHandlePositions(
	bounds: StrokeBounds,
	dominantHand: DominantHand,
	cameraZoom: number,
): SelectionHandlePositions {
	const pivot = selectionBoundsCenter(bounds);
	const offsetPage = SELECTION_ROTATE_HANDLE_OFFSET_SCREEN_PX / cameraZoom;

	if (dominantHand === 'left') {
		return {
			pivot,
			resize: { x: bounds.minX, y: bounds.maxY },
			rotate: { x: bounds.minX - offsetPage, y: bounds.minY - offsetPage },
		};
	}

	return {
		pivot,
		resize: { x: bounds.maxX, y: bounds.maxY },
		rotate: { x: bounds.maxX + offsetPage, y: bounds.minY - offsetPage },
	};
}

/** Hit-tests resize/rotate handles in page space. */
export function hitTestSelectionHandle(
	pagePoint: { x: number; y: number },
	handles: SelectionHandlePositions,
	tolerancePageUnits: number,
): SelectionHandleKind | null {
	const resizeDist = Math.hypot(pagePoint.x - handles.resize.x, pagePoint.y - handles.resize.y);
	if (resizeDist <= tolerancePageUnits) return 'resize';

	const rotateDist = Math.hypot(pagePoint.x - handles.rotate.x, pagePoint.y - handles.rotate.y);
	if (rotateDist <= tolerancePageUnits) return 'rotate';

	return null;
}

/** Minimum page size so handles stay grabbable on tiny selections. */
export function expandBoundsToMinimumSize(
	bounds: StrokeBounds,
	minPageSize: number,
): StrokeBounds {
	if (bounds.width >= minPageSize && bounds.height >= minPageSize) return bounds;
	const cx = (bounds.minX + bounds.maxX) / 2;
	const cy = (bounds.minY + bounds.maxY) / 2;
	const width = Math.max(bounds.width, minPageSize);
	const height = Math.max(bounds.height, minPageSize);
	return {
		minX: cx - width / 2,
		minY: cy - height / 2,
		maxX: cx + width / 2,
		maxY: cy + height / 2,
		width,
		height,
	};
}
