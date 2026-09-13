import { describe, expect, test } from '@jest/globals';
import { resolveInkAutosaveDelayMs } from 'src/ink-canvas/autosave-delay';

describe('resolveInkAutosaveDelayMs', () => {
	test('keeps the short quiet period on desktop', () => {
		expect(resolveInkAutosaveDelayMs({}, 500, 2000)).toBe(500);
	});

	test.each([
		{ isMobile: true },
		{ isMobileApp: true },
		{ isIosApp: true },
	])('uses the longer quiet period for mobile platform flag %#', (platform) => {
		expect(resolveInkAutosaveDelayMs(platform, 500, 2000)).toBe(2000);
	});
});
