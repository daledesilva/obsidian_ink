import { describe, expect, test } from '@jest/globals';
import {
	computePrimaryMenuBarTop,
	computeSecondaryMenuBarBottom,
} from 'src/logic/utils/menu-bar-scroll-position';

////////
////////

describe('computePrimaryMenuBarTop', () => {
	test('leaves the bar alone when the embed is fully inside the scroller', () => {
		expect(computePrimaryMenuBarTop({
			menuBarHeightPx: 40,
			embedHeightPx: 300,
			embedOffsetTopPx: 120,
			scrollAreaHeightPx: 800,
		}, true)).toBeNull();
	});

	// #124: the menu was painted inside the drawing area instead of above it.
	test('pins the bar to the scroller top when the embed top scrolls off', () => {
		const top = computePrimaryMenuBarTop({
			menuBarHeightPx: 40,
			embedHeightPx: 600,
			embedOffsetTopPx: -150,
			scrollAreaHeightPx: 800,
		}, true);
		// The bar is translated up by its own height, so it needs that much extra offset.
		expect(top).toBe(190);
	});

	test('accounts for the translated bar height in the pinned offset', () => {
		const withTranslation = computePrimaryMenuBarTop({
			menuBarHeightPx: 40,
			embedHeightPx: 600,
			embedOffsetTopPx: -100,
			scrollAreaHeightPx: 800,
		}, true);
		const withoutTranslation = computePrimaryMenuBarTop({
			menuBarHeightPx: 40,
			embedHeightPx: 600,
			embedOffsetTopPx: -100,
			scrollAreaHeightPx: 800,
		}, false);
		expect(withTranslation).toBe(140);
		expect(withoutTranslation).toBe(100);
	});

	test('stops the bar at the embed bottom when the embed has scrolled past', () => {
		const top = computePrimaryMenuBarTop({
			menuBarHeightPx: 40,
			embedHeightPx: 300,
			embedOffsetTopPx: -400,
			scrollAreaHeightPx: 800,
		}, true);
		expect(top).toBe(300);
	});

	test('never returns a negative offset', () => {
		const cases = [
			{ embedOffsetTopPx: -1 },
			{ embedOffsetTopPx: -50 },
			{ embedOffsetTopPx: -300 },
			{ embedOffsetTopPx: 0 },
		];
		for (const { embedOffsetTopPx } of cases) {
			const top = computePrimaryMenuBarTop({
				menuBarHeightPx: 40,
				embedHeightPx: 300,
				embedOffsetTopPx,
				scrollAreaHeightPx: 800,
			}, true);
			if (top !== null) expect(top).toBeGreaterThanOrEqual(0);
		}
	});
});

describe('computeSecondaryMenuBarBottom', () => {
	test('leaves the bar alone when the embed bottom is visible', () => {
		expect(computeSecondaryMenuBarBottom({
			menuBarHeightPx: 40,
			embedHeightPx: 300,
			embedOffsetTopPx: 120,
			scrollAreaHeightPx: 800,
		}, true)).toBeNull();
	});

	test('pins the bar to the embed bottom once the embed top passes the scroller bottom', () => {
		const bottom = computeSecondaryMenuBarBottom({
			menuBarHeightPx: 40,
			embedHeightPx: 300,
			embedOffsetTopPx: 900,
			scrollAreaHeightPx: 800,
		}, true);
		expect(bottom).toBe(300);
	});

	test('follows the embed bottom while it straddles the scroller bottom', () => {
		const bottom = computeSecondaryMenuBarBottom({
			menuBarHeightPx: 40,
			embedHeightPx: 300,
			embedOffsetTopPx: 700,
			scrollAreaHeightPx: 800,
		}, true);
		// Pinned offset 700 + 40 = 740; 740 + 300 - 800 - 20 = 220
		expect(bottom).toBe(220);
	});

	test('includes the half-height correction because the bar is only shifted 50% in CSS', () => {
		const geometry = {
			menuBarHeightPx: 60,
			embedHeightPx: 300,
			embedOffsetTopPx: 700,
			scrollAreaHeightPx: 800,
		};
		// 700 + 60 + 300 - 800 - 30 = 230
		expect(computeSecondaryMenuBarBottom(geometry, true)).toBe(230);
	});
});
