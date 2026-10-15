import { describe, expect, test } from '@jest/globals';
import { isPagePointInBounds } from 'src/ink-canvas/selection-bounds';
import type { StrokeBounds } from 'src/ink-canvas/svg-export';

const bounds: StrokeBounds = {
	minX: 0,
	minY: 0,
	maxX: 100,
	maxY: 50,
	width: 100,
	height: 50,
};

describe('selection bounds helpers', () => {
	test('isPagePointInBounds includes edges', () => {
		expect(isPagePointInBounds({ x: 0, y: 0 }, bounds)).toBe(true);
		expect(isPagePointInBounds({ x: 100, y: 50 }, bounds)).toBe(true);
		expect(isPagePointInBounds({ x: 101, y: 25 }, bounds)).toBe(false);
	});
});
