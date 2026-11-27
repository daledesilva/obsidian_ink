import { describe, expect, test } from '@jest/globals';
import { BoundedPenPositionFilter, MAX_PEN_FILTER_OFFSET_PX } from 'src/ink-canvas/utils/bounded-pen-position-filter';

describe('bounded pen position filter', () => {
	test('fractional positions are preserved and repeated delivery does not advance the filter', () => {
		const filter = new BoundedPenPositionFilter(0.125, 0.25, 0);
		expect(filter.update(0.125, 0.25, 0)).toEqual({ x: 0.125, y: 0.25 });
		const first = filter.update(1.125, 0.75, 8);
		expect(filter.update(1.125, 0.75, 8)).toEqual(first);
	});

	test('never displaces slow curves, sharp turns or long gaps beyond the screen-space cap', () => {
		const filter = new BoundedPenPositionFilter(0, 0, 0);
		for (let i = 1; i <= 240; i++) {
			const x = i < 120 ? i / 20 : 6;
			const y = i < 120 ? Math.sin(i / 30) : (i - 120) * 2;
			const result = filter.update(x, y, i * 8 + (i > 180 ? 1000 : 0));
			expect(Math.hypot(result.x - x, result.y - y)).toBeLessThanOrEqual(MAX_PEN_FILTER_OFFSET_PX + 1e-9);
		}
	});

	test('reduces perpendicular staircase noise without a future-point buffer', () => {
		const filter = new BoundedPenPositionFilter(0, 0, 0);
		let rawError = 0, filteredError = 0;
		for (let i = 1; i < 200; i++) {
			const x = Math.round(i * 0.8), y = Math.round(i * 0.3);
			const result = filter.update(x, y, i * 8);
			rawError += (0.3 * x - 0.8 * y) ** 2;
			filteredError += (0.3 * result.x - 0.8 * result.y) ** 2;
		}
		expect(filteredError).toBeLessThan(rawError * 0.8);
	});

	test('duplicate and nonmonotonic timestamps keep results finite', () => {
		const filter = new BoundedPenPositionFilter(0, 0, 100);
		for (const time of [100, 99, 108, 108, 102, 116]) {
			const result = filter.update(time / 10, 2, time);
			expect(Number.isFinite(result.x) && Number.isFinite(result.y)).toBe(true);
		}
	});

	test('filter state resets on every stroke and is independent of screen translation', () => {
		const a = new BoundedPenPositionFilter(0, 0, 0);
		const b = new BoundedPenPositionFilter(300, -50, 0);
		for (let i = 1; i < 20; i++) {
			const p = a.update(i * 0.25, Math.sin(i), i * 8);
			const q = b.update(300 + i * 0.25, -50 + Math.sin(i), i * 8);
			expect(q.x - 300).toBeCloseTo(p.x, 10);
			expect(q.y + 50).toBeCloseTo(p.y, 10);
		}
		const fresh = new BoundedPenPositionFilter(200, 300, 2000);
		expect(fresh.update(200, 300, 2000)).toEqual({ x: 200, y: 300 });
	});
});
