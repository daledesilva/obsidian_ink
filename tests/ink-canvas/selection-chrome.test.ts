import { describe, expect, test } from '@jest/globals';
import {
	applyRotationToSelectionChrome,
	getChromeHandlePositions,
	hitTestChromeHandle,
	isPagePointInChrome,
	selectionChromeFromBounds,
} from 'src/ink-canvas/selection-chrome';
import type { StrokeBounds } from 'src/ink-canvas/svg-export';

const bounds: StrokeBounds = {
	minX: 0,
	minY: 0,
	maxX: 100,
	maxY: 50,
	width: 100,
	height: 50,
};

describe('selection chrome', () => {
	test('isPagePointInChrome respects rotation', () => {
		let chrome = selectionChromeFromBounds(bounds);
		chrome = applyRotationToSelectionChrome(chrome, Math.PI / 4);
		const center = { x: chrome.center.x, y: chrome.center.y };
		expect(isPagePointInChrome(center, chrome)).toBe(true);
	});

	test('right-handed handles sit on bottom-right and top-right corners', () => {
		const chrome = selectionChromeFromBounds(bounds);
		const handles = getChromeHandlePositions(chrome, 'right');
		expect(handles.resize.x).toBeCloseTo(100, 5);
		expect(handles.resize.y).toBeCloseTo(50, 5);
		expect(handles.rotate.x).toBeCloseTo(100, 5);
		expect(handles.rotate.y).toBeCloseTo(0, 5);
	});

	test('left-handed handles mirror to left corners', () => {
		const chrome = selectionChromeFromBounds(bounds);
		const handles = getChromeHandlePositions(chrome, 'left');
		expect(handles.resize.x).toBeCloseTo(0, 5);
		expect(handles.rotate.x).toBeCloseTo(0, 5);
	});

	test('hitTestChromeHandle detects resize handle', () => {
		const chrome = selectionChromeFromBounds(bounds);
		const handles = getChromeHandlePositions(chrome, 'right');
		expect(hitTestChromeHandle(handles.resize, chrome, 'right', 5)).toBe('resize');
	});
});
