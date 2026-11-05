import { describe, expect, test } from '@jest/globals';
import { clampSelectionMoveDelta } from 'src/ink-canvas/selection-move-clamp';
import { getChromeAxisAlignedBounds } from 'src/ink-canvas/selection-chrome';

////////
////////

const PAGE = { width: 2000, height: 1000 };

function bounds(minX: number, minY: number, width: number, height: number) {
	return {
		minX,
		minY,
		maxX: minX + width,
		maxY: minY + height,
		width,
		height,
	};
}

describe('clampSelectionMoveDelta', () => {
	// #132: a fragment dragged above the page start could never be selected again.
	test('allows a move that keeps the selection on the page', () => {
		const delta = clampSelectionMoveDelta(
			{ x: 50, y: 30 },
			bounds(100, 100, 200, 80),
			{ pageBounds: PAGE, selectionSize: { width: 200, height: 80 } },
		);
		expect(delta).toEqual({ x: 50, y: 30 });
	});

	test('stops a selection being dragged above the top of the page', () => {
		const selection = bounds(100, 5, 200, 80);
		const delta = clampSelectionMoveDelta(
			{ x: 0, y: -500 },
			selection,
			{ pageBounds: PAGE, selectionSize: { width: 200, height: 80 } },
		);
		expect(delta.y).toBeGreaterThan(-500);
		// A sliver of the selection must remain inside the page.
		expect(selection.maxY + delta.y).toBeGreaterThan(0);
	});

	test('stops a selection being dragged below the bottom of the page', () => {
		const selection = bounds(100, 950, 200, 40);
		const delta = clampSelectionMoveDelta(
			{ x: 0, y: 500 },
			selection,
			{ pageBounds: PAGE, selectionSize: { width: 200, height: 40 } },
		);
		expect(selection.minY + delta.y).toBeLessThan(PAGE.height);
	});

	test('stops a selection being dragged past the left edge', () => {
		const selection = bounds(5, 100, 200, 80);
		const delta = clampSelectionMoveDelta(
			{ x: -400, y: 0 },
			selection,
			{ pageBounds: PAGE, selectionSize: { width: 200, height: 80 } },
		);
		expect(selection.maxX + delta.x).toBeGreaterThan(0);
	});

	test('stops a selection being dragged past the right edge', () => {
		const selection = bounds(1900, 100, 200, 80);
		const delta = clampSelectionMoveDelta(
			{ x: 400, y: 0 },
			selection,
			{ pageBounds: PAGE, selectionSize: { width: 200, height: 80 } },
		);
		expect(selection.minX + delta.x).toBeLessThan(PAGE.width);
	});

	test('leaves infinite drawing canvases completely unclamped', () => {
		const delta = clampSelectionMoveDelta(
			{ x: -100000, y: -100000 },
			bounds(100, 100, 200, 80),
			{ pageBounds: null, selectionSize: { width: 200, height: 80 } },
		);
		expect(delta).toEqual({ x: -100000, y: -100000 });
	});

	test('keeps clamping behaviour stable after repeated drags', () => {
		let selection = bounds(100, 5, 200, 80);
		let totalY = 0;
		for (let step = 0; step < 50; step++) {
			const delta = clampSelectionMoveDelta(
				{ x: 0, y: -40 },
				{ ...selection, minY: selection.minY + totalY, maxY: selection.maxY + totalY },
				{ pageBounds: PAGE, selectionSize: { width: 200, height: 80 } },
			);
			totalY += delta.y;
		}
		// Even after many drag steps the selection cannot vanish above the page.
		expect(selection.maxY + totalY).toBeGreaterThan(0);
	});
});

describe('getChromeAxisAlignedBounds', () => {
	test('returns the same rectangle for an unrotated chrome', () => {
		const result = getChromeAxisAlignedBounds({
			center: { x: 100, y: 100 },
			width: 200,
			height: 80,
			rotationRad: 0,
		});
		expect(result.minX).toBeCloseTo(0, 5);
		expect(result.minY).toBeCloseTo(60, 5);
		expect(result.width).toBeCloseTo(200, 5);
		expect(result.height).toBeCloseTo(80, 5);
	});

	test('grows the height and shrinks the width for a wide chrome at 45 degrees', () => {
		const result = getChromeAxisAlignedBounds({
			center: { x: 100, y: 100 },
			width: 200,
			height: 80,
			rotationRad: Math.PI / 4,
		});
		// 200×80 at 45° has an AABB of 198×198.
		expect(result.width).toBeCloseTo(197.99, 1);
		expect(result.height).toBeCloseTo(197.99, 1);
		// The height grew, which is what edge clamping needs to notice.
		expect(result.height).toBeGreaterThan(80);
	});

	test('swaps width and height at a quarter turn', () => {
		const result = getChromeAxisAlignedBounds({
			center: { x: 0, y: 0 },
			width: 200,
			height: 80,
			rotationRad: Math.PI / 2,
		});
		expect(result.width).toBeCloseTo(80, 5);
		expect(result.height).toBeCloseTo(200, 5);
	});
});
