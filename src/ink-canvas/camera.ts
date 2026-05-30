import type { CameraState } from './types';

///////////////////////////
///////////////////////////

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_FACTOR = 1.08;

/** Clamp a zoom value to the allowed range. */
export function clampZoom(zoom: number): number {
	return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

/**
 * Compute a new camera state after zooming around a screen-space anchor point.
 * The content under the anchor stays visually fixed.
 *
 * tldraw coordinate system:
 *   screenX = (pageX + camera.x) * camera.zoom
 *   pageX   = screenX / camera.zoom - camera.x
 *
 * To keep the content under `(anchorScreenX, anchorScreenY)` fixed after a zoom
 * change, we solve for the new camera offset:
 *   newCamX = camX + anchorScreenX * (1/newZoom - 1/oldZoom)
 */
export function zoomAtPoint(
	camera: CameraState,
	anchorScreenX: number,
	anchorScreenY: number,
	direction: 1 | -1,
): CameraState {
	const factor = direction > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
	const newZoom = clampZoom(camera.zoom * factor);

	const zoomDelta = 1 / newZoom - 1 / camera.zoom;
	return {
		x: camera.x + anchorScreenX * zoomDelta,
		y: camera.y + anchorScreenY * zoomDelta,
		zoom: newZoom,
	};
}

/**
 * Compute a new camera state after panning by a screen-space delta.
 * Delta is divided by zoom so pan speed is consistent regardless of zoom level.
 */
export function panByScreenDelta(
	camera: CameraState,
	deltaScreenX: number,
	deltaScreenY: number,
): CameraState {
	return {
		x: camera.x + deltaScreenX / camera.zoom,
		y: camera.y + deltaScreenY / camera.zoom,
		zoom: camera.zoom,
	};
}

/**
 * Convert a screen-space coordinate to page-space given the current camera.
 * This is the inverse of the camera transform applied to the SVG <g>.
 */
export function screenToPage(
	camera: CameraState,
	containerRect: DOMRect,
	screenX: number,
	screenY: number,
): { x: number; y: number } {
	return {
		x: (screenX - containerRect.left) / camera.zoom - camera.x,
		y: (screenY - containerRect.top) / camera.zoom - camera.y,
	};
}

/** Page-space distance equivalent to `screenPixels` at the current zoom. */
export function pageDistanceForScreenPixels(camera: CameraState, screenPixels: number): number {
	return screenPixels / camera.zoom;
}

/**
 * Compute a camera that fits a bounding box (in page-space) into a viewport,
 * centred with optional padding.
 */
export function fitBoundsToViewport(
	viewportWidth: number,
	viewportHeight: number,
	bounds: { x: number; y: number; width: number; height: number },
	padding: number = 16,
): CameraState {
	if (bounds.width <= 0 || bounds.height <= 0) {
		return { x: 0, y: 0, zoom: 0.3 };
	}

	const zoom = clampZoom(Math.min(
		(viewportWidth - padding * 2) / bounds.width,
		(viewportHeight - padding * 2) / bounds.height,
		1,
	));

	const boundsCenterX = bounds.x + bounds.width / 2;
	const boundsCenterY = bounds.y + bounds.height / 2;

	return {
		x: viewportWidth / (2 * zoom) - boundsCenterX,
		y: viewportHeight / (2 * zoom) - boundsCenterY,
		zoom,
	};
}

/**
 * Compute a camera that zooms to a specific level based on drag distance.
 * Used for right-drag-to-zoom gesture.
 */
/**
 * Clamp writing-mode camera Y for dedicated view scrolling.
 * Top: page Y=0 must not scroll above viewport top (cameraYMax, typically menubar offset).
 * Bottom: viewport bottom may reach at most scrollContentBottomPageY in page space
 * (one viewport below last stroke when scrollContentBottomPageY = stroke max Y).
 */
export function clampWritingCameraY(
	cameraY: number,
	zoom: number,
	viewportHeightPx: number,
	scrollContentBottomPageY: number,
	cameraYMax: number,
): number {
	const yMin = -scrollContentBottomPageY;
	return Math.min(cameraYMax, Math.max(cameraY, yMin));
}

export function zoomByDragDelta(
	camera: CameraState,
	anchorScreenX: number,
	anchorScreenY: number,
	deltaPixels: number,
	sensitivityPerPixel: number = 0.015,
): CameraState {
	const factor = 1 + deltaPixels * sensitivityPerPixel;
	const newZoom = clampZoom(camera.zoom * factor);

	const zoomDelta = 1 / newZoom - 1 / camera.zoom;
	return {
		x: camera.x + anchorScreenX * zoomDelta,
		y: camera.y + anchorScreenY * zoomDelta,
		zoom: newZoom,
	};
}
