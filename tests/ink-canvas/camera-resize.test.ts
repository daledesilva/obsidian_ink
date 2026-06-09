import {
	adjustCameraToPreservePagePointAtScreenTargets,
	adjustCameraToPreserveViewportCenter,
	screenToPage,
} from 'src/ink-canvas/camera';
import type { CameraState } from 'src/ink-canvas/types';

function domRect(left: number, top: number, width: number, height: number): DOMRect {
	return {
		left,
		top,
		right: left + width,
		bottom: top + height,
		width,
		height,
		x: left,
		y: top,
		toJSON: () => ({}),
	} as DOMRect;
}

function pagePointUnderScreenCenter(
	camera: CameraState,
	containerRect: DOMRect,
): { x: number; y: number } {
	const screenX = containerRect.left + containerRect.width / 2;
	const screenY = containerRect.top + containerRect.height / 2;
	return screenToPage(camera, containerRect, screenX, screenY);
}

describe('adjustCameraToPreserveViewportCenter', () => {
	const camera: CameraState = { x: 50, y: 30, zoom: 1.5 };

	it('keeps zoom unchanged on width-only resize', () => {
		const oldRect = domRect(100, 200, 400, 300);
		const newRect = domRect(100, 200, 600, 300);
		const next = adjustCameraToPreserveViewportCenter(camera, oldRect, newRect);
		expect(next.zoom).toBe(camera.zoom);
	});

	it('keeps zoom unchanged on height-only resize', () => {
		const oldRect = domRect(100, 200, 400, 300);
		const newRect = domRect(100, 200, 400, 200);
		const next = adjustCameraToPreserveViewportCenter(camera, oldRect, newRect);
		expect(next.zoom).toBe(camera.zoom);
	});

	it('keeps the page point under the viewport center fixed after resize', () => {
		const oldRect = domRect(100, 200, 400, 300);
		const newRect = domRect(50, 150, 500, 250);
		const pageBefore = pagePointUnderScreenCenter(camera, oldRect);
		const next = adjustCameraToPreserveViewportCenter(camera, oldRect, newRect);
		const pageAfter = pagePointUnderScreenCenter(next, newRect);
		expect(pageAfter.x).toBeCloseTo(pageBefore.x, 5);
		expect(pageAfter.y).toBeCloseTo(pageBefore.y, 5);
	});
});

describe('adjustCameraToPreservePagePointAtScreenTargets (embed resize)', () => {
	const camera: CameraState = { x: 20, y: -10, zoom: 0.8 };

	it('keeps zoom unchanged when embed center moves and container grows', () => {
		const oldContainerRect = domRect(100, 100, 300, 200);
		const newContainerRect = domRect(100, 100, 450, 280);
		const oldEmbedCenterX = 250;
		const oldEmbedCenterY = 200;
		const newEmbedCenterX = 325;
		const newEmbedCenterY = 240;

		const pageBefore = screenToPage(camera, oldContainerRect, oldEmbedCenterX, oldEmbedCenterY);
		const next = adjustCameraToPreservePagePointAtScreenTargets(
			camera,
			oldContainerRect,
			oldEmbedCenterX,
			oldEmbedCenterY,
			newContainerRect,
			newEmbedCenterX,
			newEmbedCenterY,
		);
		expect(next.zoom).toBe(camera.zoom);

		const pageAfter = screenToPage(next, newContainerRect, newEmbedCenterX, newEmbedCenterY);
		expect(pageAfter.x).toBeCloseTo(pageBefore.x, 5);
		expect(pageAfter.y).toBeCloseTo(pageBefore.y, 5);
	});
});
