import { describe, expect, test } from '@jest/globals';
import { getEraserClientSamplePoints, type ClientPoint } from 'src/ink-canvas/utils/eraser-hit-samples';
import { eraserHitRadiusScreenPx } from 'src/ink-canvas/stroke-zoom-scale';

function nearestDistance(x: number, y: number, samples: ClientPoint[]): number {
	let nearestSq = Infinity;
	for (const p of samples) nearestSq = Math.min(nearestSq, (p.x - x) ** 2 + (p.y - y) ** 2);
	return Math.sqrt(nearestSq);
}

describe('dense eraser area sampling', () => {
	test.each([0.1, 0.5, 1, 3])('sparse mode restores nine probes with the same radius at zoom %s', (zoom) => {
		const x = 100.37, y = 80.61, radius = eraserHitRadiusScreenPx(zoom);
		const sparse = getEraserClientSamplePoints(x, y, null, zoom, false);
		expect(sparse).toHaveLength(9);
		expect(sparse[0]).toEqual({ x, y });
		for (const point of sparse.slice(1)) expect(Math.hypot(point.x - x, point.y - y)).toBeCloseTo(radius);
		expect(getEraserClientSamplePoints(x, y, null, zoom, true).length).toBeGreaterThan(700);
	});

	test('sparse sweeps retain the original eight-pixel center spacing', () => {
		const start = { x: 100, y: 100 };
		const sparse = getEraserClientSamplePoints(132, 100, start, 1, false);
		for (const x of [100, 108, 116, 124, 132]) expect(sparse).toContainEqual({ x, y: 100 });
		expect(sparse.length).toBeLessThanOrEqual(5 * 9);
	});
	test.each([0.1, 0.5, 1, 3])('covers the filled disk including a fractional center at zoom %s', (zoom) => {
		const x = 100.37, y = 80.61, radius = eraserHitRadiusScreenPx(zoom);
		const samples = getEraserClientSamplePoints(x, y, null, zoom);
		for (let dx = -radius; dx <= radius; dx += 0.5) {
			for (let dy = -radius; dy <= radius; dy += 0.5) {
				if (dx * dx + dy * dy > radius * radius) continue;
				expect(nearestDistance(x + dx, y + dy, samples)).toBeLessThan(1);
			}
		}
		for (const sample of samples) expect(Math.hypot(sample.x - x, sample.y - y)).toBeLessThanOrEqual(radius + 1e-6);
	});

	test('hits short interior strokes that center-and-ring sampling missed', () => {
		const samples = getEraserClientSamplePoints(100, 100, null, 1);
		// A short horizontal mark well inside the disk, away from the old nine probes.
		expect(samples.some((p) => p.x >= 104 && p.x <= 107 && p.y >= 104.6 && p.y <= 105.4)).toBe(true);
	});

	test.each([[100, 0], [0, 100], [80.3, 64.7], [-85.2, 23.9]])('covers fast movement (%s, %s) without gaps or increasing the radius', (dx, dy) => {
		const start = { x: 70.37, y: 80.61 };
		const end = { x: start.x + dx, y: start.y + dy };
		const radius = eraserHitRadiusScreenPx(1), distance = Math.hypot(dx, dy);
		const samples = [
			...getEraserClientSamplePoints(start.x, start.y, null, 1),
			...getEraserClientSamplePoints(end.x, end.y, start, 1),
		];
		for (let along = 0; along <= distance; along += 1.7) {
			for (let across = -radius; across <= radius; across += 1.3) {
				const x = start.x + (dx * along - dy * across) / distance;
				const y = start.y + (dy * along + dx * across) / distance;
				expect(nearestDistance(x, y, samples)).toBeLessThan(1);
			}
		}
		for (const point of samples) {
			const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (distance * distance)));
			expect(Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy)).toBeLessThanOrEqual(radius + 1e-6);
		}
	});

	test('small movements test the new crescent rather than repeating the whole disk', () => {
		const initial = getEraserClientSamplePoints(100.25, 100.25, null, 1);
		const next = getEraserClientSamplePoints(101.25, 100.25, { x: 100.25, y: 100.25 }, 1);
		expect(next.length).toBeGreaterThan(0);
		expect(next.length).toBeLessThan(initial.length / 4);
		const keys = next.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
		expect(new Set(keys).size).toBe(keys.length);
		expect(getEraserClientSamplePoints(100, 100, { x: 100, y: 100 }, 1)).toHaveLength(0);
	});
});
