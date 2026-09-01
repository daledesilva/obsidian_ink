import { describe, expect, test } from '@jest/globals';
import {
	drawingToolbarClustersOverlap,
	horizontalRectsOverlap,
	isVisibleToolbarClusterRect,
} from 'src/logic/utils/toolbar-cluster-overlap';

function rect(left: number, width: number, top = 0, height = 40): DOMRect {
	return {
		left,
		right: left + width,
		top,
		bottom: top + height,
		width,
		height,
		x: left,
		y: top,
		toJSON: () => ({}),
	} as DOMRect;
}

describe('isVisibleToolbarClusterRect', () => {
	test('returns false for zero-width rects', () => {
		expect(isVisibleToolbarClusterRect(rect(0, 0))).toBe(false);
	});

	test('returns true for non-zero rects', () => {
		expect(isVisibleToolbarClusterRect(rect(10, 50))).toBe(true);
	});
});

describe('horizontalRectsOverlap', () => {
	test('returns false when rects are separated by more than gap', () => {
		expect(horizontalRectsOverlap(rect(0, 40), rect(50, 40), 4)).toBe(false);
	});

	test('returns true when rects overlap', () => {
		expect(horizontalRectsOverlap(rect(0, 40), rect(30, 40), 0)).toBe(true);
	});

	test('returns false when clearance equals gap', () => {
		expect(horizontalRectsOverlap(rect(0, 40), rect(44, 40), 4)).toBe(false);
	});
});

describe('drawingToolbarClustersOverlap', () => {
	const center = rect(100, 80);

	test('returns false when only centre is present', () => {
		expect(drawingToolbarClustersOverlap({ left: null, center, right: null }, 4)).toBe(false);
	});

	test('returns true when centre overlaps right', () => {
		const right = rect(150, 60);
		expect(drawingToolbarClustersOverlap({ left: null, center, right }, 4)).toBe(true);
	});

	test('returns true when centre overlaps left', () => {
		const left = rect(30, 80);
		expect(drawingToolbarClustersOverlap({ left, center, right: null }, 4)).toBe(true);
	});

	test('returns false when centre has clearance from both sides', () => {
		const left = rect(0, 40);
		const right = rect(200, 40);
		expect(drawingToolbarClustersOverlap({ left, center, right }, 4)).toBe(false);
	});

	test('skips zero-width side clusters', () => {
		const right = rect(200, 0);
		expect(drawingToolbarClustersOverlap({ left: null, center, right }, 4)).toBe(false);
	});
});
