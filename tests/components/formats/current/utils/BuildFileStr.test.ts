import { describe, expect, test } from '@jest/globals';
import { buildFileStr } from 'src/components/formats/current/utils/buildFileStr';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { InkFileData } from 'src/components/formats/current/types/file-data';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';

////////
////////

const minimalSnapshot = {
	document: { store: {}, schema: { schemaVersion: 2, sequences: {} } },
	session: {},
} as any;

function makeWritingFileData(writingLineHeight?: number): InkFileData {
	return {
		meta: {
			pluginVersion: PLUGIN_VERSION,
			tldrawVersion: TLDRAW_VERSION,
			fileType: 'inkWriting',
			writingLineHeight,
		},
		tldraw: minimalSnapshot,
		svgString: '<svg xmlns="http://www.w3.org/2000/svg"><defs/></svg>',
	};
}

function makeDrawingFileData(): InkFileData {
	return {
		meta: {
			pluginVersion: PLUGIN_VERSION,
			tldrawVersion: TLDRAW_VERSION,
			fileType: 'inkDrawing',
		},
		tldraw: minimalSnapshot,
		svgString: '<svg xmlns="http://www.w3.org/2000/svg"><defs/></svg>',
	};
}

////////
////////

describe('buildFileStr — writing-line-height attribute', () => {

	test('includes writing-line-height attribute when writingLineHeight is set', () => {
		const result = buildFileStr(makeWritingFileData(200));
		expect(result).toContain('writing-line-height="200"');
	});

	test('includes correct value for non-default line heights', () => {
		const result = buildFileStr(makeWritingFileData(50));
		expect(result).toContain('writing-line-height="50"');

		const result400 = buildFileStr(makeWritingFileData(400));
		expect(result400).toContain('writing-line-height="400"');
	});

	test('omits writing-line-height attribute when writingLineHeight is undefined', () => {
		const result = buildFileStr(makeWritingFileData(undefined));
		expect(result).not.toContain('writing-line-height');
	});

	test('drawing file never includes writing-line-height attribute', () => {
		const result = buildFileStr(makeDrawingFileData());
		expect(result).not.toContain('writing-line-height');
	});

	test('always includes the ink element with file-type attribute', () => {
		const result = buildFileStr(makeWritingFileData(150));
		expect(result).toContain('file-type="inkWriting"');
	});

	test('always includes the tldraw element', () => {
		const result = buildFileStr(makeWritingFileData(150));
		expect(result).toContain('<tldraw');
	});
});

////////

describe('buildFileStr — round-trip with extractInkJsonFromSvg', () => {

	test('writingLineHeight 200 survives a full serialize → parse round-trip', () => {
		const original = makeWritingFileData(200);
		const svgStr = buildFileStr(original);
		const parsed = extractInkJsonFromSvg(svgStr);

		expect(parsed).not.toBeNull();
		expect(parsed!.meta.writingLineHeight).toBe(200);
	});

	test('writingLineHeight 50 survives a full serialize → parse round-trip', () => {
		const original = makeWritingFileData(50);
		const svgStr = buildFileStr(original);
		const parsed = extractInkJsonFromSvg(svgStr);

		expect(parsed).not.toBeNull();
		expect(parsed!.meta.writingLineHeight).toBe(50);
	});

	test('undefined writingLineHeight round-trips as undefined (old-file compat)', () => {
		const original = makeWritingFileData(undefined);
		const svgStr = buildFileStr(original);
		const parsed = extractInkJsonFromSvg(svgStr);

		expect(parsed).not.toBeNull();
		expect(parsed!.meta.writingLineHeight).toBeUndefined();
	});

	test('fileType is preserved through the round-trip', () => {
		const original = makeWritingFileData(150);
		const svgStr = buildFileStr(original);
		const parsed = extractInkJsonFromSvg(svgStr);

		expect(parsed).not.toBeNull();
		expect(parsed!.meta.fileType).toBe('inkWriting');
	});

	test('second serialize after parse produces identical writingLineHeight', () => {
		// Simulates: load file → buildFileStr (save) → extractInkJsonFromSvg (load again)
		const original = makeWritingFileData(300);
		const firstSvg = buildFileStr(original);
		const firstParsed = extractInkJsonFromSvg(firstSvg);

		const secondSvg = buildFileStr({ ...firstParsed!, svgString: firstSvg });
		const secondParsed = extractInkJsonFromSvg(secondSvg);

		expect(secondParsed!.meta.writingLineHeight).toBe(300);
	});
});
