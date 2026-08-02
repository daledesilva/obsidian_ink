import { describe, expect, test } from '@jest/globals';
import { getRenderedStrokeData } from 'src/ink-canvas/rendered-stroke-cache';
import type { InkStroke } from 'src/ink-canvas/types';
import { DEFAULT_STROKE_STYLE } from 'src/ink-canvas/types';

const stroke: InkStroke = {
	id: 'cached-stroke',
	points: [[0, 0, 0.5], [20, 10, 0.6], [40, 5, 0.5]],
	style: { ...DEFAULT_STROKE_STYLE },
	offset: { x: 0, y: 0 },
};

describe('rendered stroke cache', () => {
	test('reuses the rendered outline for the same immutable stroke', () => {
		const first = getRenderedStrokeData(stroke);
		const second = getRenderedStrokeData(stroke);

		expect(second).toBe(first);
		expect(first.pathD).not.toBe('');
		expect(first.bounds.maxX).toBeGreaterThan(first.bounds.minX);
	});

	test('keeps translation outside cached path geometry', () => {
		const movedStroke = { ...stroke, offset: { x: 100, y: 200 } };
		const original = getRenderedStrokeData(stroke);
		const moved = getRenderedStrokeData(movedStroke);

		expect(moved.pathD).toBe(original.pathD);
		expect(moved.bounds).toEqual(original.bounds);
	});
});
