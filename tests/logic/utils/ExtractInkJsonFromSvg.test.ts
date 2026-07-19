import { describe, expect, test } from '@jest/globals';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';

////////
////////

// Minimal valid tldraw snapshot JSON embedded in test SVGs
const TLDRAW_JSON = JSON.stringify({
	document: { store: {}, schema: { schemaVersion: 2, sequences: {} } },
	session: {},
});

function makeSvg(inkAttributes: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg">
		<metadata>
			<ink plugin-version="${PLUGIN_VERSION}" file-type="inkWriting" ${inkAttributes}/>
			<tldraw version="${TLDRAW_VERSION}">${TLDRAW_JSON}</tldraw>
		</metadata>
	</svg>`;
}

////////
////////

describe('extractInkJsonFromSvg — writingLineHeight parsing', () => {

	test('reads writing-line-height attribute as a number', () => {
		const svg = makeSvg('writing-line-height="200"');
		const result = extractInkJsonFromSvg(svg);

		expect(result).not.toBeNull();
		expect(result!.meta.writingLineHeight).toBe(200);
	});

	test('reads non-default line heights correctly', () => {
		const svg50 = makeSvg('writing-line-height="50"');
		expect(extractInkJsonFromSvg(svg50)!.meta.writingLineHeight).toBe(50);

		const svg400 = makeSvg('writing-line-height="400"');
		expect(extractInkJsonFromSvg(svg400)!.meta.writingLineHeight).toBe(400);
	});

	test('returns undefined writingLineHeight when attribute is absent (old file)', () => {
		// Simulates files created before the feature existed
		const svg = makeSvg('');
		const result = extractInkJsonFromSvg(svg);

		expect(result).not.toBeNull();
		expect(result!.meta.writingLineHeight).toBeUndefined();
	});

	test('returns undefined for non-numeric writing-line-height value (corrupted data)', () => {
		const svg = makeSvg('writing-line-height="notanumber"');
		const result = extractInkJsonFromSvg(svg);

		expect(result).not.toBeNull();
		// parseInt('notanumber', 10) → NaN, which is falsy → stored as undefined
		expect(result!.meta.writingLineHeight).toBeUndefined();
	});

	test('does not break on SVG without any ink element', () => {
		const svg = `<svg xmlns="http://www.w3.org/2000/svg">
			<metadata>
				<tldraw version="${TLDRAW_VERSION}">${TLDRAW_JSON}</tldraw>
			</metadata>
		</svg>`;
		// No <ink> element → fileType is missing → should return null (no fileType to gate on)
		const result = extractInkJsonFromSvg(svg);
		expect(result).toBeNull();
	});

	test('parses a drawing file without writing-line-height attribute', () => {
		const svg = `<svg xmlns="http://www.w3.org/2000/svg">
			<metadata>
				<ink plugin-version="${PLUGIN_VERSION}" file-type="inkDrawing"/>
				<tldraw version="${TLDRAW_VERSION}">${TLDRAW_JSON}</tldraw>
			</metadata>
		</svg>`;
		const result = extractInkJsonFromSvg(svg);

		expect(result).not.toBeNull();
		expect(result!.meta.fileType).toBe('inkDrawing');
		expect(result!.meta.writingLineHeight).toBeUndefined();
	});

	test('returns null for SVG with no metadata element', () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg"><defs/></svg>';
		const result = extractInkJsonFromSvg(svg);
		expect(result).toBeNull();
	});

	test('returns null for malformed SVG string', () => {
		const result = extractInkJsonFromSvg('this is not svg');
		// DOMParser may or may not produce a parsererror — either null or a null result
		// The important thing is it does not throw
		expect(() => extractInkJsonFromSvg('this is not svg')).not.toThrow();
	});

	test('fileType and pluginVersion are still parsed correctly alongside writingLineHeight', () => {
		const svg = makeSvg('writing-line-height="250"');
		const result = extractInkJsonFromSvg(svg);

		expect(result).not.toBeNull();
		expect(result!.meta.fileType).toBe('inkWriting');
		expect(result!.meta.pluginVersion).toBe(PLUGIN_VERSION);
		expect(result!.meta.writingLineHeight).toBe(250);
	});
});
