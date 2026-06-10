import { describe, expect, test } from '@jest/globals';
import {
	fitStrokesForDrawingToWriting,
	fitStrokesForWritingToDrawing,
	previewDrawingToWritingScale,
} from 'src/ink-canvas/fit-strokes-for-mode-conversion';
import { computeStrokesBounds } from 'src/ink-canvas/svg-export';
import { DEFAULT_STROKE_STYLE, type InkStroke } from 'src/ink-canvas/types';
import { WRITING_LINE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';

function makeStroke(
	id: string,
	points: [number, number, number][],
	offset = { x: 0, y: 0 },
	size = DEFAULT_STROKE_STYLE.size,
): InkStroke {
	return {
		id,
		points,
		style: { ...DEFAULT_STROKE_STYLE, size },
		offset,
	};
}

describe('fitStrokesForDrawingToWriting', () => {
	test('returns empty array for empty input', () => {
		expect(fitStrokesForDrawingToWriting([])).toEqual([]);
	});

	test('does not mutate input strokes', () => {
		const stroke = makeStroke('s1', [[0, 0, 0.5], [100, 0, 0.5]]);
		const original = JSON.parse(JSON.stringify(stroke));
		fitStrokesForDrawingToWriting([stroke]);
		expect(stroke).toEqual(original);
	});

	test('uses scale 1 for small strokes but still repositions to writing layout', () => {
		const topY = WRITING_LINE_HEIGHT * 0.5;
		const margin = WRITING_PAGE_WIDTH * 0.05;
		const strokes = [makeStroke('s1', [[margin, topY, 0.5], [margin + 100, topY, 0.5]])];
		const before = computeStrokesBounds(strokes);
		const result = fitStrokesForDrawingToWriting(strokes);
		const bounds = computeStrokesBounds(result);
		expect(bounds.minY).toBeCloseTo(topY, 0);
		expect(bounds.width).toBeCloseTo(before.width, 0);
		expect(previewDrawingToWritingScale(strokes)).toBe(1);
		const contentWidth = WRITING_PAGE_WIDTH - 2 * margin;
		expect(bounds.minX + bounds.width / 2).toBeCloseTo(margin + contentWidth / 2, 0);
	});

	test('shrinks strokes that are too wide for the writing page', () => {
		const strokes = [makeStroke('wide', [[0, 50, 0.5], [WRITING_PAGE_WIDTH * 2, 50, 0.5]])];
		const scale = previewDrawingToWritingScale(strokes);
		expect(scale).toBeLessThan(1);

		const result = fitStrokesForDrawingToWriting(strokes);
		const bounds = computeStrokesBounds(result);
		const margin = WRITING_PAGE_WIDTH * 0.05;
		const contentWidth = WRITING_PAGE_WIDTH - 2 * margin;
		expect(bounds.width).toBeLessThanOrEqual(contentWidth + 1);
	});

	test('never upscales small drawings', () => {
		const strokes = [makeStroke('tiny', [[0, 0, 0.5], [10, 0, 0.5]])];
		expect(previewDrawingToWritingScale(strokes)).toBe(1);
		const before = computeStrokesBounds(strokes);
		const after = computeStrokesBounds(fitStrokesForDrawingToWriting(strokes));
		expect(after.width).toBeCloseTo(before.width, 0);
	});

	test('top-aligns content below first line margin', () => {
		const strokes = [makeStroke('off', [[500, 800, 0.5], [600, 800, 0.5]])];
		const result = fitStrokesForDrawingToWriting(strokes);
		const bounds = computeStrokesBounds(result);
		const topY = WRITING_LINE_HEIGHT * 0.5;
		expect(bounds.minY).toBeCloseTo(topY, 0);
	});

	test('horizontally centers content in the writing margins', () => {
		const strokes = [makeStroke('mid', [[0, 0, 0.5], [200, 0, 0.5]])];
		const result = fitStrokesForDrawingToWriting(strokes);
		const bounds = computeStrokesBounds(result);
		const margin = WRITING_PAGE_WIDTH * 0.05;
		const contentWidth = WRITING_PAGE_WIDTH - 2 * margin;
		const expectedCenterX = margin + contentWidth / 2;
		const actualCenterX = bounds.minX + bounds.width / 2;
		expect(actualCenterX).toBeCloseTo(expectedCenterX, 0);
	});

	test('transforms strokes with non-zero offset', () => {
		const strokes = [
			makeStroke('offset', [[0, 0, 0.5], [50, 0, 0.5]], { x: 3000, y: 500 }),
		];
		const result = fitStrokesForDrawingToWriting(strokes);
		const bounds = computeStrokesBounds(result);
		const margin = WRITING_PAGE_WIDTH * 0.05;
		expect(bounds.minX).toBeGreaterThanOrEqual(margin - 1);
		expect(bounds.maxX).toBeLessThanOrEqual(WRITING_PAGE_WIDTH - margin + 1);
	});

	test('scales stroke size when shrinking', () => {
		const size = 8;
		const strokes = [makeStroke('wide', [[0, 50, 0.5], [WRITING_PAGE_WIDTH * 2, 50, 0.5]], { x: 0, y: 0 }, size)];
		const scale = previewDrawingToWritingScale(strokes);
		const result = fitStrokesForDrawingToWriting(strokes);
		expect(result[0].style.size).toBeCloseTo(size * scale, 5);
	});
});

describe('fitStrokesForWritingToDrawing', () => {
	test('returns cloned strokes unchanged', () => {
		const strokes = [makeStroke('s1', [[10, 20, 0.5], [100, 20, 0.5]])];
		const result = fitStrokesForWritingToDrawing(strokes);
		expect(result).toEqual(strokes);
		expect(result).not.toBe(strokes);
		expect(result[0]).not.toBe(strokes[0]);
	});
});
