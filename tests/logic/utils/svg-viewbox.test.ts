import { describe, expect, test } from '@jest/globals';
import {
	parseSvgViewBoxRect,
	resolveDrawingPreviewViewBox,
	svgViewBoxesMatch,
	viewBoxAspectRatio,
} from 'src/logic/utils/svg-viewbox';

////////
////////

const DEFAULT_URL_VIEW_BOX = { x: 0, y: 0, width: 500, height: 281 };

describe('parseSvgViewBoxRect', () => {
	test('parses a plain viewBox', () => {
		expect(parseSvgViewBoxRect('<svg viewBox="0 0 2000 975"></svg>')).toEqual({
			x: 0,
			y: 0,
			width: 2000,
			height: 975,
		});
	});

	test('parses fractional origin values used by tightly fitted drawings', () => {
		const parsed = parseSvgViewBoxRect(
			'<svg viewBox="453.58762554745294 197.50725442407474 829.7457077858805 1533.2510617954645"></svg>',
		);
		expect(parsed?.x).toBeCloseTo(453.5876, 3);
		expect(parsed?.height).toBeCloseTo(1533.251, 3);
	});

	test('accepts single quotes', () => {
		expect(parseSvgViewBoxRect("<svg viewBox='0 0 10 20'></svg>")).toEqual({
			x: 0,
			y: 0,
			width: 10,
			height: 20,
		});
	});

	test('accepts comma separators', () => {
		expect(parseSvgViewBoxRect('<svg viewBox="0,0,10,20"></svg>')).toEqual({
			x: 0,
			y: 0,
			width: 10,
			height: 20,
		});
	});

	test('returns null when there is no viewBox', () => {
		expect(parseSvgViewBoxRect('<svg></svg>')).toBeNull();
	});

	test('returns null for a zero or negative size', () => {
		expect(parseSvgViewBoxRect('<svg viewBox="0 0 0 20"></svg>')).toBeNull();
		expect(parseSvgViewBoxRect('<svg viewBox="0 0 -10 20"></svg>')).toBeNull();
	});

	test('returns null for too few numbers', () => {
		expect(parseSvgViewBoxRect('<svg viewBox="0 0 10"></svg>')).toBeNull();
	});
});

describe('resolveDrawingPreviewViewBox', () => {
	const fileViewBox = { x: 453.58, y: 197.5, width: 829.74, height: 1533.25 };

	// #180: the drift came from applying the default URL viewBox when the URL had none.
	test('uses the URL viewBox when the URL pinned one', () => {
		const urlViewBox = { x: 10, y: 20, width: 400, height: 300 };
		expect(resolveDrawingPreviewViewBox(urlViewBox, true, fileViewBox)).toEqual(urlViewBox);
	});

	test('prefers the file viewBox when the URL had no viewBox params', () => {
		expect(resolveDrawingPreviewViewBox(DEFAULT_URL_VIEW_BOX, false, fileViewBox)).toEqual(fileViewBox);
	});

	test('falls back to the URL viewBox when the file has no viewBox', () => {
		expect(resolveDrawingPreviewViewBox(DEFAULT_URL_VIEW_BOX, false, null)).toEqual(DEFAULT_URL_VIEW_BOX);
	});

	test('returns null when neither source has a viewBox', () => {
		expect(resolveDrawingPreviewViewBox(null, false, null)).toBeNull();
	});

	test('does not apply the default 0 0 500 281 box when the file disagrees', () => {
		const resolved = resolveDrawingPreviewViewBox(DEFAULT_URL_VIEW_BOX, false, fileViewBox);
		expect(resolved).not.toEqual(DEFAULT_URL_VIEW_BOX);
		expect(resolved?.width).toBeCloseTo(829.74, 2);
	});
});

describe('svgViewBoxesMatch', () => {
	test('matches identical boxes', () => {
		expect(svgViewBoxesMatch({ x: 0, y: 0, width: 500, height: 281 }, { x: 0, y: 0, width: 500, height: 281 })).toBe(true);
	});

	test('matches within the default tolerance', () => {
		expect(svgViewBoxesMatch({ x: 0, y: 0, width: 500, height: 281 }, { x: 0.2, y: 0.1, width: 500.3, height: 281.2 })).toBe(true);
	});

	test('rejects boxes that differ by more than the tolerance', () => {
		expect(svgViewBoxesMatch({ x: 0, y: 0, width: 500, height: 281 }, { x: 0, y: 0, width: 829, height: 1533 })).toBe(false);
	});

	test('rejects comparisons where one side is missing', () => {
		expect(svgViewBoxesMatch(null, { x: 0, y: 0, width: 1, height: 1 })).toBe(false);
		expect(svgViewBoxesMatch({ x: 0, y: 0, width: 1, height: 1 }, null)).toBe(false);
	});
});

describe('viewBoxAspectRatio', () => {
	test('computes width over height', () => {
		expect(viewBoxAspectRatio({ x: 0, y: 0, width: 2000, height: 1000 })).toBe(2);
	});

	test('returns null for a missing or degenerate box', () => {
		expect(viewBoxAspectRatio(null)).toBeNull();
		expect(viewBoxAspectRatio({ x: 0, y: 0, width: 10, height: 0 })).toBeNull();
	});
});
