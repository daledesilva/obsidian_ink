import { describe, expect, test } from '@jest/globals';
import { WRITING_LINE_HEIGHT, WRITING_MIN_PAGE_HEIGHT } from 'src/constants';

// Use requireActual because tldraw-helpers is globally mocked in setupTests.ts
// and these are pure arithmetic functions that don't need mocking.
const {
	cropWritingStrokeHeightInvitingly,
	cropWritingStrokeHeightTightly,
} = jest.requireActual('src/components/formats/current/utils/tldraw-helpers') as {
	cropWritingStrokeHeightInvitingly: (height: number, bufferLines?: number) => number;
	cropWritingStrokeHeightTightly: (height: number) => number;
};

////////
////////

// Formula: (Math.ceil(height / LINE_HEIGHT) + bufferLines + 0.5) * LINE_HEIGHT
// with result floored at WRITING_MIN_PAGE_HEIGHT

const L = WRITING_LINE_HEIGHT; // 150

describe('cropWritingStrokeHeightInvitingly', () => {

	describe('default buffer (2 lines)', () => {
		test('content at exactly 1 line height (150px)', () => {
			// numOfLines = ceil(150/150) = 1; result = (1 + 2 + 0.5) * 150 = 525
			expect(cropWritingStrokeHeightInvitingly(L)).toBe(3.5 * L);
		});

		test('content at exactly 2 lines height (300px)', () => {
			// numOfLines = ceil(300/150) = 2; result = (2 + 2 + 0.5) * 150 = 675
			expect(cropWritingStrokeHeightInvitingly(2 * L)).toBe(4.5 * L);
		});

		test('content just 1px past a line boundary (301px)', () => {
			// numOfLines = ceil(301/150) = 3; result = (3 + 2 + 0.5) * 150 = 825
			expect(cropWritingStrokeHeightInvitingly(2 * L + 1)).toBe(5.5 * L);
		});

		test('empty content (0 height) returns WRITING_MIN_PAGE_HEIGHT', () => {
			// numOfLines = ceil(0/150) = 0; result = (0 + 2 + 0.5) * 150 = 375
			// Math.max(375, WRITING_MIN_PAGE_HEIGHT=375) = 375
			const result = cropWritingStrokeHeightInvitingly(0);
			expect(result).toBe(Math.max(2.5 * L, WRITING_MIN_PAGE_HEIGHT));
		});

		test('large content at 10 lines (1500px)', () => {
			// numOfLines = 10; result = (10 + 2 + 0.5) * 150 = 1875
			expect(cropWritingStrokeHeightInvitingly(10 * L)).toBe(12.5 * L);
		});

		test('result is never less than WRITING_MIN_PAGE_HEIGHT', () => {
			expect(cropWritingStrokeHeightInvitingly(0)).toBeGreaterThanOrEqual(WRITING_MIN_PAGE_HEIGHT);
			expect(cropWritingStrokeHeightInvitingly(1)).toBeGreaterThanOrEqual(WRITING_MIN_PAGE_HEIGHT);
			expect(cropWritingStrokeHeightInvitingly(L)).toBeGreaterThanOrEqual(WRITING_MIN_PAGE_HEIGHT);
		});
	});

	describe('buffer of 3', () => {
		test('content at 1 line height (150px)', () => {
			// numOfLines = 1; result = (1 + 3 + 0.5) * 150 = 675
			expect(cropWritingStrokeHeightInvitingly(L, 3)).toBe(4.5 * L);
		});

		test('empty content', () => {
			// result = (0 + 3 + 0.5) * 150 = 525
			const result = cropWritingStrokeHeightInvitingly(0, 3);
			expect(result).toBe(Math.max(3.5 * L, WRITING_MIN_PAGE_HEIGHT));
		});
	});

	describe('buffer of 1', () => {
		test('content at 1 line height (150px)', () => {
			// numOfLines = 1; result = (1 + 1 + 0.5) * 150 = 375
			expect(cropWritingStrokeHeightInvitingly(L, 1)).toBe(2.5 * L);
		});

		test('empty content', () => {
			// result = (0 + 1 + 0.5) * 150 = 225
			// Math.max(225, WRITING_MIN_PAGE_HEIGHT=375) = 375
			const result = cropWritingStrokeHeightInvitingly(0, 1);
			expect(result).toBe(Math.max(1.5 * L, WRITING_MIN_PAGE_HEIGHT));
		});
	});

	describe('boundary regression: buffer 2 gives 2 writable lines before growth', () => {
		// With the old broken value of +1.5:
		//   content at 150px -> (1 + 1.5) * 150 = 375px (embed height)
		//   content at 300px -> (2 + 1.5) * 150 = 525px (embed grows when writing on 2nd line)
		// With the new value of bufferLines=2 (+2.5 total):
		//   content at 150px -> (1 + 2.5) * 150 = 525px
		//   content at 300px -> (2 + 2.5) * 150 = 675px (embed grows only when content crosses full line boundary)
		//   The embed stays at 525px until content reaches 300px exactly,
		//   meaning the user can write anywhere in the 2 visible empty lines without triggering growth.

		test('embed set to 525px at 1 line content; stays 525px until content crosses 2nd line', () => {
			const heightAt1Line = cropWritingStrokeHeightInvitingly(L, 2);
			expect(heightAt1Line).toBe(3.5 * L); // 525

			// Content at 149px (just below 1 full line) still rounds to 1 line
			const heightAtAlmost1Line = cropWritingStrokeHeightInvitingly(L - 1, 2);
			expect(heightAtAlmost1Line).toBe(3.5 * L); // 525 - no change

			// Content at 300px (exactly 2 full lines) triggers growth
			const heightAt2Lines = cropWritingStrokeHeightInvitingly(2 * L, 2);
			expect(heightAt2Lines).toBe(4.5 * L); // 675 - grows
		});

		test('buffer 2 produces larger height than old broken 1.5 at same content', () => {
			// Old behavior would have been: (numOfLines + 1.5) * LINE_HEIGHT
			const oldStyleHeight = (1 + 1.5) * L; // 375
			const newStyleHeight = cropWritingStrokeHeightInvitingly(L, 2); // 525
			expect(newStyleHeight).toBeGreaterThan(oldStyleHeight);
		});
	});

	describe('buffer of 0 (no empty lines)', () => {
		test('content at 1 line', () => {
			// numOfLines = 1; result = (1 + 0 + 0.5) * 150 = 225
			// Math.max(225, WRITING_MIN_PAGE_HEIGHT=375) = 375
			const result = cropWritingStrokeHeightInvitingly(L, 0);
			expect(result).toBe(Math.max(1.5 * L, WRITING_MIN_PAGE_HEIGHT));
		});
	});
});

////////

describe('cropWritingStrokeHeightTightly (unchanged signature)', () => {
	test('uses 0.5 padding, floored at WRITING_MIN_PAGE_HEIGHT', () => {
		// Tight: max((numOfLines + 0.5) * LINE_HEIGHT, WRITING_MIN_PAGE_HEIGHT)
		// At 1 line: (1 + 0.5) * 150 = 225; floor is 375; result = 375
		const result = cropWritingStrokeHeightTightly(L);
		expect(result).toBe(Math.max(1.5 * L, WRITING_MIN_PAGE_HEIGHT));
	});

	test('at 3 lines (450px) produces 3.5 * LINE_HEIGHT (above floor)', () => {
		// (3 + 0.5) * 150 = 525; floor is 375; result = 525
		const result = cropWritingStrokeHeightTightly(3 * L);
		expect(result).toBe(3.5 * L);
	});

	test('does not accept a buffer parameter (exactly 1 param)', () => {
		expect(typeof cropWritingStrokeHeightTightly).toBe('function');
		expect(cropWritingStrokeHeightTightly.length).toBe(1);
	});

	test('result is never less than WRITING_MIN_PAGE_HEIGHT', () => {
		expect(cropWritingStrokeHeightTightly(0)).toBeGreaterThanOrEqual(WRITING_MIN_PAGE_HEIGHT);
		expect(cropWritingStrokeHeightTightly(L)).toBeGreaterThanOrEqual(WRITING_MIN_PAGE_HEIGHT);
	});
});

////////

describe('WRITING_MIN_PAGE_HEIGHT constant', () => {
	test('equals 2.5 * WRITING_LINE_HEIGHT (default buffer 2 + 0.5 padding)', () => {
		expect(WRITING_MIN_PAGE_HEIGHT).toBe(2.5 * WRITING_LINE_HEIGHT);
	});

	test('is 375px with WRITING_LINE_HEIGHT=150', () => {
		expect(WRITING_MIN_PAGE_HEIGHT).toBe(375);
	});
});
