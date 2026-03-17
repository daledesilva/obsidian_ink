import { describe, expect, test } from '@jest/globals';
import { WRITING_LINE_HEIGHT } from 'src/constants';

// Use requireActual because tldraw-helpers is globally mocked in setupTests.ts
// and shouldResizeForNewHeight is a pure function that doesn't need mocking.
const { shouldResizeForNewHeight } = jest.requireActual(
	'src/components/formats/current/utils/tldraw-helpers'
) as {
	shouldResizeForNewHeight: (
		newHeight: number,
		curHeight: number | null,
		bufferLines: number,
	) => boolean;
};

////////
////////

const L = WRITING_LINE_HEIGHT; // 150

// Heights produced by cropWritingStrokeHeightInvitingly(n * L, bufferLines=3):
// formula: (Math.ceil(h / L) + bufferLines + 0.5) * L
// line 1: (1 + 3 + 0.5) * 150 = 675
// line 2: (2 + 3 + 0.5) * 150 = 825
// line 3: (3 + 3 + 0.5) * 150 = 975
// line 4: (4 + 3 + 0.5) * 150 = 1125

describe('shouldResizeForNewHeight', () => {

	describe('first stroke (curHeight = null)', () => {
		test('always returns true regardless of newHeight', () => {
			expect(shouldResizeForNewHeight(675, null, 3)).toBe(true);
		});

		test('returns true with bufferLines = 1', () => {
			expect(shouldResizeForNewHeight(375, null, 1)).toBe(true);
		});

		test('returns true with any newHeight value', () => {
			expect(shouldResizeForNewHeight(0, null, 3)).toBe(true);
			expect(shouldResizeForNewHeight(99999, null, 3)).toBe(true);
		});
	});

	////////

	describe('no resize within buffer zone (bufferLines = 3)', () => {
		// After initial resize to line 1 height (675), guard threshold = 675 + (3-1)*150 = 975.
		// Lines 2 and 3 produce newHeights 825 and 975, both ≤ 975, so no resize.

		test('line 2 stroke (newHeight 825) does not resize after initial line 1 resize (curHeight 675)', () => {
			expect(shouldResizeForNewHeight(4.5 * L, 4.5 * L, 3)).toBe(false);
		});

		test('line 2 stroke newHeight (825) stays below threshold 975', () => {
			expect(shouldResizeForNewHeight(5.5 * L, 4.5 * L, 3)).toBe(false);
		});

		test('line 3 stroke newHeight (975) at exact threshold is not strictly greater — no resize', () => {
			// threshold = 675 + 2*150 = 975; 975 > 975 is false
			expect(shouldResizeForNewHeight(6.5 * L, 4.5 * L, 3)).toBe(false);
		});

		test('same newHeight as curHeight does not resize', () => {
			expect(shouldResizeForNewHeight(675, 675, 3)).toBe(false);
		});
	});

	////////

	describe('resize when buffer zone is exhausted (bufferLines = 3)', () => {
		// Line 4 stroke (newHeight 1125) exceeds threshold 975 — resize triggered.

		test('line 4 stroke (newHeight 1125) exceeds threshold after line 1 resize (curHeight 675)', () => {
			// threshold = 675 + 2*150 = 975; 1125 > 975
			expect(shouldResizeForNewHeight(7.5 * L, 4.5 * L, 3)).toBe(true);
		});

		test('successive trigger at line 7 (newHeight 1575) after line 4 resize (curHeight 1125)', () => {
			// threshold = 1125 + 2*150 = 1425; 1575 > 1425
			expect(shouldResizeForNewHeight(10.5 * L, 7.5 * L, 3)).toBe(true);
		});

		test('line 6 (newHeight 1425) at exact threshold of line 4 curHeight (1125) — no resize', () => {
			// threshold = 1125 + 2*150 = 1425; 1425 > 1425 is false
			expect(shouldResizeForNewHeight(9.5 * L, 7.5 * L, 3)).toBe(false);
		});
	});

	////////

	describe('erase resize (content shrank)', () => {
		test('any newHeight strictly below curHeight triggers resize', () => {
			expect(shouldResizeForNewHeight(675, 825, 3)).toBe(true);
		});

		test('erasing back to minimum height still triggers resize', () => {
			expect(shouldResizeForNewHeight(375, 675, 3)).toBe(true);
		});

		test('erasing to zero triggers resize', () => {
			expect(shouldResizeForNewHeight(0, 675, 3)).toBe(true);
		});

		test('newHeight exactly equal to curHeight does not trigger erase-resize', () => {
			expect(shouldResizeForNewHeight(675, 675, 3)).toBe(false);
		});
	});

	////////

	describe('buffer setting affects resize threshold', () => {
		// With bufferLines = 1: threshold = curHeight + 0*L; any growth triggers resize.
		test('bufferLines = 1: newHeight 1px above curHeight triggers resize immediately', () => {
			expect(shouldResizeForNewHeight(676, 675, 1)).toBe(true);
		});

		test('bufferLines = 1: newHeight equal to curHeight does not resize', () => {
			expect(shouldResizeForNewHeight(675, 675, 1)).toBe(false);
		});

		// With bufferLines = 2: threshold = curHeight + 1*L; one line of buffer.
		test('bufferLines = 2: newHeight one line above curHeight does not resize (within 1-line buffer)', () => {
			// threshold = 525 + 1*150 = 675; newHeight 675 > 675 is false
			expect(shouldResizeForNewHeight(4.5 * L, 3.5 * L, 2)).toBe(false);
		});

		test('bufferLines = 2: newHeight two lines above curHeight triggers resize', () => {
			// threshold = 525 + 1*150 = 675; newHeight 825 > 675 is true
			expect(shouldResizeForNewHeight(5.5 * L, 3.5 * L, 2)).toBe(true);
		});

		// With bufferLines = 3: threshold = curHeight + 2*L; two lines of buffer.
		test('bufferLines = 3: newHeight two lines above curHeight does not resize', () => {
			// threshold = 675 + 2*150 = 975; newHeight 975 is not > 975
			expect(shouldResizeForNewHeight(6.5 * L, 4.5 * L, 3)).toBe(false);
		});

		test('bufferLines = 3: newHeight three lines above curHeight triggers resize', () => {
			// threshold = 675 + 2*150 = 975; newHeight 1125 > 975
			expect(shouldResizeForNewHeight(7.5 * L, 4.5 * L, 3)).toBe(true);
		});
	});

	////////

	describe('threshold uses WRITING_LINE_HEIGHT constant', () => {
		// Prove the threshold scales with WRITING_LINE_HEIGHT, not a hard-coded value.
		// With bufferLines = 3 and curHeight = 675 (4.5 * L):
		//   threshold = 675 + (3-1) * L = 675 + 2*150 = 975
		// A newHeight of 975 + 1 should pass; 975 should not.
		test('value just above threshold (curHeight + 2*L + 1) triggers resize', () => {
			const curHeight = 4.5 * L;
			const threshold = curHeight + (3 - 1) * L;
			expect(shouldResizeForNewHeight(threshold + 1, curHeight, 3)).toBe(true);
		});

		test('value at exact threshold (curHeight + 2*L) does not trigger resize', () => {
			const curHeight = 4.5 * L;
			const threshold = curHeight + (3 - 1) * L;
			expect(shouldResizeForNewHeight(threshold, curHeight, 3)).toBe(false);
		});

		test('halving WRITING_LINE_HEIGHT-sized step still respects the formula', () => {
			// If the constant were 300 (doubled), threshold would be curHeight + 600 and this test would fail.
			// With L=150: curHeight=450, threshold=450+300=750; newHeight 751 > 750 → true
			const curHeight = 3 * L;
			const threshold = curHeight + (3 - 1) * L;
			expect(shouldResizeForNewHeight(threshold + 1, curHeight, 3)).toBe(true);
			expect(shouldResizeForNewHeight(threshold, curHeight, 3)).toBe(false);
		});
	});

	////////

	describe('sequential add succession (bufferLines = 3, simulated line-by-line)', () => {
		// Simulate the full 9-line fixture sequence. Each line produces a new inviting height.
		// Heights: line n → (n + 3 + 0.5) * 150
		// curHeight tracks the last applied height (starts null).
		// Expected resizes at lines 1, 4, 7.

		test('line 1: resize (first stroke, curHeight null)', () => {
			expect(shouldResizeForNewHeight(4.5 * L, null, 3)).toBe(true);
		});

		test('line 2: no resize (within buffer zone)', () => {
			expect(shouldResizeForNewHeight(5.5 * L, 4.5 * L, 3)).toBe(false);
		});

		test('line 3: no resize (at threshold boundary, not strictly greater)', () => {
			expect(shouldResizeForNewHeight(6.5 * L, 4.5 * L, 3)).toBe(false);
		});

		test('line 4: resize (exceeds threshold)', () => {
			expect(shouldResizeForNewHeight(7.5 * L, 4.5 * L, 3)).toBe(true);
		});

		test('line 5: no resize (within new buffer zone after line 4 resize)', () => {
			// curHeight is now 7.5*L = 1125; threshold = 1125 + 300 = 1425
			// line 5 newHeight = (5+3+0.5)*150 = 1275 < 1425
			expect(shouldResizeForNewHeight(8.5 * L, 7.5 * L, 3)).toBe(false);
		});

		test('line 6: no resize (at threshold boundary)', () => {
			// line 6 newHeight = 1425 = threshold exactly
			expect(shouldResizeForNewHeight(9.5 * L, 7.5 * L, 3)).toBe(false);
		});

		test('line 7: resize (exceeds threshold)', () => {
			// line 7 newHeight = 1575 > 1425
			expect(shouldResizeForNewHeight(10.5 * L, 7.5 * L, 3)).toBe(true);
		});

		test('line 8: no resize (within new buffer zone after line 7 resize)', () => {
			// curHeight is now 10.5*L = 1575; threshold = 1575 + 300 = 1875
			// line 8 newHeight = (8+3+0.5)*150 = 1725 < 1875
			expect(shouldResizeForNewHeight(11.5 * L, 10.5 * L, 3)).toBe(false);
		});

		test('line 9: no resize (at threshold boundary)', () => {
			// line 9 newHeight = 1875 = threshold exactly
			expect(shouldResizeForNewHeight(12.5 * L, 10.5 * L, 3)).toBe(false);
		});
	});

	////////

	describe('sequential erase succession (bufferLines = 3)', () => {
		// Erasing content back through lines always shrinks → should always resize.

		test('erasing from line 9 to line 8 triggers resize', () => {
			expect(shouldResizeForNewHeight(11.5 * L, 12.5 * L, 3)).toBe(true);
		});

		test('erasing from line 4 to line 3 triggers resize', () => {
			expect(shouldResizeForNewHeight(6.5 * L, 7.5 * L, 3)).toBe(true);
		});

		test('erasing from line 1 to empty triggers resize', () => {
			// WRITING_MIN_PAGE_HEIGHT is 375 = 2.5*L; this is below curHeight of 675
			expect(shouldResizeForNewHeight(2.5 * L, 4.5 * L, 3)).toBe(true);
		});
	});

	////////

	describe('add → erase → add again (bufferLines = 3)', () => {
		// Write to line 3 (no resize from line 1's curHeight=675, since line 3 = 975 = threshold).
		// Erase back to line 1 (resize down to 675).
		// Re-add line 2 (825 < 675? No. 825 > 675 + 300 = 975? No.) — no resize.
		// Re-add line 3 (975 > 975? No) — still no resize.
		// Re-add line 4 (1125 > 975? Yes) — resize.

		test('after erase back to line 1 (curHeight=675), re-adding line 2 (825) does not resize', () => {
			expect(shouldResizeForNewHeight(5.5 * L, 4.5 * L, 3)).toBe(false);
		});

		test('after erase back to line 1, re-adding line 3 (975) at exact threshold does not resize', () => {
			expect(shouldResizeForNewHeight(6.5 * L, 4.5 * L, 3)).toBe(false);
		});

		test('after erase back to line 1, re-adding line 4 (1125) triggers resize', () => {
			expect(shouldResizeForNewHeight(7.5 * L, 4.5 * L, 3)).toBe(true);
		});
	});

});
