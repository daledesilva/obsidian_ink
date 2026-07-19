import { embedViewBoxFromCamera, fitBoundsToViewport } from 'src/ink-canvas/camera';

describe('embedViewBoxFromCamera', () => {
	it('round-trips with fitBoundsToViewport for a known bounds and 500x281 viewport', () => {
		const viewportWidth = 500;
		const viewportHeight = 281;
		const bounds = { x: 100, y: 50, width: 400, height: 200 };

		const camera = fitBoundsToViewport(viewportWidth, viewportHeight, bounds, 16);
		const viewBox = embedViewBoxFromCamera(camera, viewportWidth, viewportHeight);

		expect(viewBox.x).toBeCloseTo(-camera.x, 5);
		expect(viewBox.y).toBeCloseTo(-camera.y, 5);
		expect(viewBox.width).toBeCloseTo(viewportWidth / camera.zoom, 5);
		expect(viewBox.height).toBeCloseTo(viewportHeight / camera.zoom, 5);

		// Strokes should lie inside the viewBox page rectangle
		expect(bounds.x).toBeGreaterThanOrEqual(viewBox.x - 1);
		expect(bounds.y).toBeGreaterThanOrEqual(viewBox.y - 1);
		expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewBox.x + viewBox.width + 1);
		expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewBox.y + viewBox.height + 1);
	});
});
