import { describe, expect, test } from '@jest/globals';
import { strokeIntersectsLassoPolygon } from 'src/ink-canvas/utils/lasso-stroke-selection';
import type { InkStroke } from 'src/ink-canvas/types';
import { DEFAULT_STROKE_STYLE } from 'src/ink-canvas/types';

function makeStroke(points: InkStroke['points'], offset = { x: 0, y: 0 }): InkStroke {
	return {
		id: 's1',
		points,
		style: { ...DEFAULT_STROKE_STYLE, size: 4 },
		offset,
	};
}

const squareLasso = [
	{ x: 0, y: 0 },
	{ x: 100, y: 0 },
	{ x: 100, y: 100 },
	{ x: 0, y: 100 },
];

describe('strokeIntersectsLassoPolygon', () => {
	test('selects when a stroke point lies inside the lasso', () => {
		const stroke = makeStroke([[50, 50, 0.5], [60, 60, 0.5]]);
		expect(strokeIntersectsLassoPolygon(stroke, squareLasso)).toBe(true);
	});

	test('selects when the lasso only crosses the stroke segment', () => {
		const stroke = makeStroke([[90, 50, 0.5], [110, 50, 0.5]]);
		expect(strokeIntersectsLassoPolygon(stroke, squareLasso)).toBe(true);
	});

	test('does not select a stroke far outside the lasso', () => {
		const stroke = makeStroke([[200, 200, 0.5], [250, 250, 0.5]]);
		expect(strokeIntersectsLassoPolygon(stroke, squareLasso)).toBe(false);
	});
});
