import { describe, expect, test } from '@jest/globals';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';
import { DEFAULT_STROKE_STYLE } from 'src/ink-canvas/types';
import {
	getInkStrokesFromSvg,
	inkFileHasStrokes,
	showLockedChrome,
} from 'src/logic/utils/ink-file-has-strokes';

function makeInkCanvasSvg(strokes: object[], fileType: 'inkDrawing' | 'inkWriting' = 'inkDrawing'): string {
	const inkCanvasJson = JSON.stringify({
		version: 1,
		strokes,
		gridEnabled: false,
	});
	return `<svg xmlns="http://www.w3.org/2000/svg">
		<metadata>
			<ink plugin-version="${PLUGIN_VERSION}" file-type="${fileType}"/>
			<ink-canvas version="0.5.0">${inkCanvasJson}</ink-canvas>
		</metadata>
	</svg>`;
}

function makeTldrawSvg(store: Record<string, unknown>): string {
	const tldrawJson = JSON.stringify({
		document: { store, schema: { schemaVersion: 2, sequences: {} } },
		session: {},
	});
	return `<svg xmlns="http://www.w3.org/2000/svg">
		<metadata>
			<ink plugin-version="${PLUGIN_VERSION}" file-type="inkDrawing"/>
			<tldraw version="${TLDRAW_VERSION}">${tldrawJson}</tldraw>
		</metadata>
	</svg>`;
}

describe('getInkStrokesFromSvg', () => {
	test('returns empty array for ink-canvas file with no strokes', () => {
		expect(getInkStrokesFromSvg(makeInkCanvasSvg([]))).toEqual([]);
	});

	test('returns strokes from ink-canvas metadata', () => {
		const stroke = {
			id: 's1',
			points: [[0, 0, 0.5], [10, 10, 0.5]],
			style: { ...DEFAULT_STROKE_STYLE },
			offset: { x: 0, y: 0 },
		};
		expect(getInkStrokesFromSvg(makeInkCanvasSvg([stroke]))).toHaveLength(1);
	});

	test('returns empty array when metadata is missing', () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
		expect(getInkStrokesFromSvg(svg)).toEqual([]);
	});

	test('returns empty array for legacy tldraw store with no draw shapes', () => {
		const svg = makeTldrawSvg({
			'shape:writing-container': {
				typeName: 'shape',
				type: 'writing-container',
				id: 'shape:writing-container',
			},
		});
		expect(getInkStrokesFromSvg(svg)).toEqual([]);
	});

	test('returns strokes migrated from legacy tldraw draw shapes', () => {
		const svg = makeTldrawSvg({
			'shape:draw': {
				typeName: 'shape',
				type: 'draw',
				id: 'shape:draw',
				x: 0,
				y: 0,
				props: {
					color: 'black',
					size: 'm',
					isPen: false,
					isComplete: true,
					segments: [{
						type: 'free',
						points: [{ x: 0, y: 0, z: 0.5 }, { x: 20, y: 20, z: 0.5 }],
					}],
				},
			},
		});
		expect(getInkStrokesFromSvg(svg)).toHaveLength(1);
	});
});

describe('inkFileHasStrokes', () => {
	test('is false for empty ink-canvas file', () => {
		expect(inkFileHasStrokes(makeInkCanvasSvg([]))).toBe(false);
	});

	test('is true when ink-canvas strokes exist', () => {
		const stroke = {
			id: 's1',
			points: [[0, 0, 0.5]],
			style: { ...DEFAULT_STROKE_STYLE },
			offset: { x: 0, y: 0 },
		};
		expect(inkFileHasStrokes(makeInkCanvasSvg([stroke]))).toBe(true);
	});
});

describe('showLockedChrome', () => {
	test('follows setting when stroke state is unknown', () => {
		expect(showLockedChrome(true, null)).toBe(true);
		expect(showLockedChrome(false, null)).toBe(false);
	});

	test('forces chrome when file has no strokes', () => {
		expect(showLockedChrome(false, false)).toBe(true);
	});

	test('follows setting when file has strokes', () => {
		expect(showLockedChrome(false, true)).toBe(false);
		expect(showLockedChrome(true, true)).toBe(true);
	});
});
