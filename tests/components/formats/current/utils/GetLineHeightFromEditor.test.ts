import { describe, expect, test } from '@jest/globals';
import { WRITING_LINE_HEIGHT } from 'src/constants';

// Use requireActual because tldraw-helpers is globally mocked in setupTests.ts
// and getLineHeightFromEditor is a pure function that only needs a minimal editor stub.
const { getLineHeightFromEditor } = jest.requireActual(
	'src/components/formats/current/utils/tldraw-helpers'
) as {
	getLineHeightFromEditor: (editor: any) => number;
};

////////
// Minimal editor stubs
////////

function makeEditor(writingLineHeight: unknown) {
	return {
		store: {
			get: (id: string) => {
				if (id === 'document:document') {
					return { meta: { writingLineHeight } };
				}
				return undefined;
			},
		},
	};
}

function makeEditorWithNoDocumentRecord() {
	return {
		store: {
			get: (_id: string) => undefined,
		},
	};
}

function makeEditorWithNoMeta() {
	return {
		store: {
			get: (id: string) => {
				if (id === 'document:document') {
					return {}; // no meta property
				}
				return undefined;
			},
		},
	};
}

////////
////////

describe('getLineHeightFromEditor', () => {

	test('returns the stored lineHeight when it is a positive number', () => {
		const editor = makeEditor(250);
		expect(getLineHeightFromEditor(editor)).toBe(250);
	});

	test('returns the stored lineHeight for non-default values (50, 400)', () => {
		expect(getLineHeightFromEditor(makeEditor(50))).toBe(50);
		expect(getLineHeightFromEditor(makeEditor(400))).toBe(400);
	});

	test('returns the constant default when writingLineHeight is undefined', () => {
		const editor = makeEditor(undefined);
		expect(getLineHeightFromEditor(editor)).toBe(WRITING_LINE_HEIGHT);
	});

	test('returns the constant default when writingLineHeight is 0 (invalid)', () => {
		// 0 fails the > 0 guard
		const editor = makeEditor(0);
		expect(getLineHeightFromEditor(editor)).toBe(WRITING_LINE_HEIGHT);
	});

	test('returns the constant default when writingLineHeight is negative', () => {
		const editor = makeEditor(-100);
		expect(getLineHeightFromEditor(editor)).toBe(WRITING_LINE_HEIGHT);
	});

	test('returns the constant default when writingLineHeight is a string (corrupted data)', () => {
		// typeof 'string' !== 'number' → fallback
		const editor = makeEditor('200');
		expect(getLineHeightFromEditor(editor)).toBe(WRITING_LINE_HEIGHT);
	});

	test('returns the constant default when writingLineHeight is NaN', () => {
		// typeof NaN === 'number' but NaN > 0 is false
		const editor = makeEditor(NaN);
		expect(getLineHeightFromEditor(editor)).toBe(WRITING_LINE_HEIGHT);
	});

	test('returns the constant default when there is no document:document record', () => {
		const editor = makeEditorWithNoDocumentRecord();
		expect(getLineHeightFromEditor(editor)).toBe(WRITING_LINE_HEIGHT);
	});

	test('returns the constant default when the document record has no meta', () => {
		const editor = makeEditorWithNoMeta();
		expect(getLineHeightFromEditor(editor)).toBe(WRITING_LINE_HEIGHT);
	});

	test('default fallback equals the WRITING_LINE_HEIGHT constant (150)', () => {
		// Pins the constant so any change to WRITING_LINE_HEIGHT is a visible test failure
		const editor = makeEditor(undefined);
		expect(getLineHeightFromEditor(editor)).toBe(150);
	});
});
