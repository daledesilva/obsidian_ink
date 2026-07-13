import { screenToPage } from './camera';
import type { CameraState, InkStroke } from './types';

////////
////////

/** Axis-aligned rectangle in page/canvas space. */
export type PageRect = {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
};

/**
 * Cheap page-space bounds for viewport culling only.
 * Uses input points + size padding instead of perfect-freehand outlines so
 * pan/scroll does not pay getStroke for every stroke just to decide visibility.
 * Storage and StrokeStore are never filtered by this helper.
 */
export function computeApproxStrokePageBounds(stroke: InkStroke): PageRect {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	for (const [px, py] of stroke.points) {
		if (px < minX) minX = px;
		if (py < minY) minY = py;
		if (px > maxX) maxX = px;
		if (py > maxY) maxY = py;
	}

	if (!Number.isFinite(minX)) {
		return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
	}

	// Pad by stroke size so outline expansion / thinning still intersects correctly.
	const pad = Math.max(stroke.style.size, 1);
	return {
		minX: minX + stroke.offset.x - pad,
		minY: minY + stroke.offset.y - pad,
		maxX: maxX + stroke.offset.x + pad,
		maxY: maxY + stroke.offset.y + pad,
	};
}

export function pageRectsIntersect(a: PageRect, b: PageRect): boolean {
	return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/**
 * Page-space rect for the portion of the canvas container that is actually on screen
 * (container ∩ browser viewport), with a screen-pixel margin for scroll hysteresis.
 * Returns null when the container is fully off-screen — callers should cull all strokes.
 */
export function visiblePageRectFromContainer(
	camera: CameraState,
	containerRect: DOMRect,
	marginScreenPx: number = 80,
): PageRect | null {
	const visibleLeft = Math.max(containerRect.left, 0) - marginScreenPx;
	const visibleTop = Math.max(containerRect.top, 0) - marginScreenPx;
	const visibleRight = Math.min(containerRect.right, window.innerWidth) + marginScreenPx;
	const visibleBottom = Math.min(containerRect.bottom, window.innerHeight) + marginScreenPx;

	if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) {
		return null;
	}

	const topLeft = screenToPage(camera, containerRect, visibleLeft, visibleTop);
	const bottomRight = screenToPage(camera, containerRect, visibleRight, visibleBottom);

	return {
		minX: Math.min(topLeft.x, bottomRight.x),
		minY: Math.min(topLeft.y, bottomRight.y),
		maxX: Math.max(topLeft.x, bottomRight.x),
		maxY: Math.max(topLeft.y, bottomRight.y),
	};
}
