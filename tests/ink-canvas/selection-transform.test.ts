import { describe, expect, test } from '@jest/globals';
import {
	rotationDeltaForDominantHand,
	rotationDeltaFromPointers,
	scaleFactorFromPointerDistance,
	transformStrokesAroundPivot,
} from 'src/ink-canvas/selection-transform';
import type { InkStroke } from 'src/ink-canvas/types';
import { DEFAULT_STROKE_STYLE } from 'src/ink-canvas/types';

function makeStroke(id: string, points: InkStroke['points'], offset = { x: 0, y: 0 }): InkStroke {
	return {
		id,
		points,
		style: { ...DEFAULT_STROKE_STYLE, size: 4 },
		offset,
	};
}

describe('transformStrokesAroundPivot', () => {
	test('scales stroke size and geometry about pivot', () => {
		const stroke = makeStroke('a', [[0, 0, 0.5], [10, 0, 0.5]]);
		const pivot = { x: 0, y: 0 };
		const [next] = transformStrokesAroundPivot([stroke], pivot, 2, 0);

		expect(next.style.size).toBe(8);
		expect(next.points[1][0]).toBe(20);
		expect(next.offset).toEqual({ x: 0, y: 0 });
	});

	test('rotates points about pivot', () => {
		const stroke = makeStroke('a', [[10, 0, 0.5]]);
		const pivot = { x: 0, y: 0 };
		const [next] = transformStrokesAroundPivot([stroke], pivot, 1, Math.PI / 2);

		expect(next.points[0][0]).toBeCloseTo(0, 5);
		expect(next.points[0][1]).toBeCloseTo(10, 5);
	});
});

describe('scaleFactorFromPointerDistance', () => {
	test('returns ratio of distances from pivot', () => {
		const pivot = { x: 0, y: 0 };
		const start = { x: 10, y: 0 };
		const current = { x: 20, y: 0 };
		expect(scaleFactorFromPointerDistance(pivot, start, current)).toBe(2);
	});
});

describe('rotationDeltaFromPointers', () => {
	test('returns angle delta in radians', () => {
		const pivot = { x: 0, y: 0 };
		const start = { x: 10, y: 0 };
		const current = { x: 0, y: 10 };
		expect(rotationDeltaFromPointers(pivot, start, current)).toBeCloseTo(Math.PI / 2, 5);
	});
});

describe('rotationDeltaForDominantHand', () => {
	test('inverts delta for left-handed rotate handle', () => {
		const pivot = { x: 0, y: 0 };
		const start = { x: 10, y: 0 };
		const current = { x: 0, y: 10 };
		expect(rotationDeltaForDominantHand('right', pivot, start, current)).toBeCloseTo(Math.PI / 2, 5);
		expect(rotationDeltaForDominantHand('left', pivot, start, current)).toBeCloseTo(-Math.PI / 2, 5);
	});
});
