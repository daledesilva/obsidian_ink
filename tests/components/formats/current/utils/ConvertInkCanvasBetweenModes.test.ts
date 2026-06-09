import { describe, expect, test } from '@jest/globals';
import { PLUGIN_VERSION, WRITING_LINE_HEIGHT } from 'src/constants';
import {
	convertDrawInkCanvasDataToWrite,
	convertWriteInkCanvasDataToDraw,
} from 'src/components/formats/current/utils/convert-ink-canvas-between-modes';
import { buildFileStr } from 'src/components/formats/current/utils/buildFileStr';
import { isInkCanvasFile } from 'src/components/formats/current/utils/ink-file-storage-engine';
import { DEFAULT_STROKE_STYLE, type InkStroke } from 'src/ink-canvas/types';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import type { InkFileData } from 'src/components/formats/current/types/file-data';

const SAMPLE_STROKE: InkStroke = {
	id: 'stroke-1',
	points: [
		[10, 20, 0.5],
		[100, 20, 0.5],
	],
	style: { ...DEFAULT_STROKE_STYLE },
	offset: { x: 0, y: 0 },
};

function makeInkCanvasSvg(fileType: 'inkWriting' | 'inkDrawing', snapshot: object): string {
	const inkCanvasJson = JSON.stringify(snapshot);
	return `<svg xmlns="http://www.w3.org/2000/svg">
		<metadata>
			<ink plugin-version="${PLUGIN_VERSION}" file-type="${fileType}"/>
			<ink-canvas version="0.5.0">${inkCanvasJson}</ink-canvas>
		</metadata>
	</svg>`;
}

function parseInkCanvasFile(svg: string): InkFileData {
	const data = extractInkJsonFromSvg(svg);
	expect(data).not.toBeNull();
	expect(isInkCanvasFile(data!)).toBe(true);
	return data!;
}

describe('convertWriteInkCanvasDataToDraw', () => {
	test('updates file type, grid, and drops writing line height', () => {
		const svg = makeInkCanvasSvg('inkWriting', {
			version: 1,
			strokes: [SAMPLE_STROKE],
			gridEnabled: false,
			writingLineHeight: 120,
			camera: { x: 1, y: 2, zoom: 1.5 },
		});
		const input = parseInkCanvasFile(svg);

		const result = convertWriteInkCanvasDataToDraw(input);

		expect(result.meta.fileType).toBe('inkDrawing');
		expect(result.inkCanvas!.gridEnabled).toBe(true);
		expect(result.inkCanvas!.writingLineHeight).toBeUndefined();
		expect(result.inkCanvas!.camera).toBeUndefined();
		expect(result.inkCanvas!.strokes).toHaveLength(1);
		expect(result.inkCanvas!.strokes[0].id).toBe('stroke-1');
	});

	test('uses gridEnabled true when passed explicitly', () => {
		const svg = makeInkCanvasSvg('inkWriting', {
			version: 1,
			strokes: [SAMPLE_STROKE],
			gridEnabled: false,
			writingLineHeight: 120,
		});
		const input = parseInkCanvasFile(svg);

		const result = convertWriteInkCanvasDataToDraw(input, true);

		expect(result.inkCanvas!.gridEnabled).toBe(true);
	});

	test('uses gridEnabled false when passed explicitly', () => {
		const svg = makeInkCanvasSvg('inkWriting', {
			version: 1,
			strokes: [SAMPLE_STROKE],
			gridEnabled: false,
			writingLineHeight: 120,
		});
		const input = parseInkCanvasFile(svg);

		const result = convertWriteInkCanvasDataToDraw(input, false);

		expect(result.inkCanvas!.gridEnabled).toBe(false);
	});

	test('re-renders SVG without tldraw metadata', () => {
		const svg = makeInkCanvasSvg('inkWriting', {
			version: 1,
			strokes: [SAMPLE_STROKE],
			gridEnabled: false,
			writingLineHeight: WRITING_LINE_HEIGHT,
		});
		const input = parseInkCanvasFile(svg);

		const converted = convertWriteInkCanvasDataToDraw(input);
		const output = buildFileStr(converted);

		expect(output).toContain('<ink-canvas');
		expect(output).toContain('file-type="inkDrawing"');
		expect(output).not.toContain('<tldraw');
		expect(extractInkJsonFromSvg(output)?.meta.fileType).toBe('inkDrawing');
	});
});

describe('convertDrawInkCanvasDataToWrite', () => {
	test('updates file type, grid off, and applies default line height', () => {
		const svg = makeInkCanvasSvg('inkDrawing', {
			version: 1,
			strokes: [SAMPLE_STROKE],
			gridEnabled: true,
			camera: { x: 0, y: 0, zoom: 2 },
		});
		const input = parseInkCanvasFile(svg);

		const result = convertDrawInkCanvasDataToWrite(input, 175);

		expect(result.meta.fileType).toBe('inkWriting');
		expect(result.meta.writingLineHeight).toBe(175);
		expect(result.inkCanvas!.gridEnabled).toBe(false);
		expect(result.inkCanvas!.writingLineHeight).toBe(175);
		expect(result.inkCanvas!.camera).toBeUndefined();
	});

	test('re-renders SVG with writing guide lines', () => {
		const svg = makeInkCanvasSvg('inkDrawing', {
			version: 1,
			strokes: [SAMPLE_STROKE],
			gridEnabled: true,
		});
		const input = parseInkCanvasFile(svg);

		const converted = convertDrawInkCanvasDataToWrite(input, WRITING_LINE_HEIGHT);
		const output = buildFileStr(converted);

		expect(output).toContain('file-type="inkWriting"');
		expect(output).toMatch(/<line[^>]+stroke-opacity="0\.5"/);
		expect(extractInkJsonFromSvg(output)?.inkCanvas?.writingLineHeight).toBe(
			WRITING_LINE_HEIGHT,
		);
	});
});

describe('ink-canvas write -> draw -> write round trip', () => {
	test('restores file type and stroke count', () => {
		const svg = makeInkCanvasSvg('inkWriting', {
			version: 1,
			strokes: [SAMPLE_STROKE],
			gridEnabled: false,
			writingLineHeight: WRITING_LINE_HEIGHT,
		});
		const input = parseInkCanvasFile(svg);

		const asDraw = convertWriteInkCanvasDataToDraw(input);
		const asWrite = convertDrawInkCanvasDataToWrite(asDraw, WRITING_LINE_HEIGHT);

		expect(asWrite.meta.fileType).toBe('inkWriting');
		expect(asWrite.inkCanvas!.strokes).toHaveLength(1);
		expect(asWrite.inkCanvas!.strokes[0].points).toEqual(SAMPLE_STROKE.points);
	});
});

describe('vault conversion flow simulation', () => {
	test('extract → convert → buildFileStr produces parseable ink-canvas drawing', () => {
		const svg = makeInkCanvasSvg('inkWriting', {
			version: 1,
			strokes: [SAMPLE_STROKE],
			gridEnabled: false,
			writingLineHeight: WRITING_LINE_HEIGHT,
		});
		const data = parseInkCanvasFile(svg);
		const converted = convertWriteInkCanvasDataToDraw(data);
		const output = buildFileStr(converted);
		const reparsed = extractInkJsonFromSvg(output);

		expect(reparsed).not.toBeNull();
		expect(isInkCanvasFile(reparsed!)).toBe(true);
		expect(reparsed!.meta.fileType).toBe('inkDrawing');
		expect(reparsed!.inkCanvas!.strokes).toHaveLength(1);
	});
});
