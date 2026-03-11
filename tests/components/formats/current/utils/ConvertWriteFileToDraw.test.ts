import { describe, expect, test } from '@jest/globals';
import { convertWriteDataToDraw } from 'src/components/formats/current/utils/convertWriteFileToDraw';
import { convertDrawDataToWrite } from 'src/components/formats/current/utils/convertDrawFileToWrite';
import { InkFileData } from 'src/components/formats/current/types/file-data';
import { buildFileStr } from 'src/components/formats/current/utils/buildFileStr';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { WRITING_MIN_PAGE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';

////////
////////

const PAGE_ID = 'page:test-page-1';

// SerializedStore<TLRecord> only allows known record IDs as keys. Cast to a plain
// string-keyed record when tests need to access shapes by their string ID.
function store(data: InkFileData): Record<string, any> {
	return data.tldraw.document.store as unknown as Record<string, any>;
}

function makeWritingFileData(extraShapes: Record<string, unknown> = {}): InkFileData {
	return {
		meta: {
			pluginVersion: '1.0.0',
			tldrawVersion: '2.1.0',
			fileType: 'inkWriting',
		},
		tldraw: {
			document: {
				store: {
					'document:document': { gridSize: 10, name: '', meta: {}, id: 'document:document', typeName: 'document' } as any,
					[PAGE_ID]: { meta: {}, id: PAGE_ID, name: 'Handwritten Note', index: 'a1', typeName: 'page' } as any,
					'shape:writing-lines': {
						x: 0, y: 0, rotation: 0, isLocked: true, opacity: 1, meta: {},
						type: 'writing-lines', parentId: PAGE_ID, index: 'a1',
						props: { x: 0, y: 0, w: WRITING_PAGE_WIDTH, h: WRITING_MIN_PAGE_HEIGHT },
						id: 'shape:writing-lines', typeName: 'shape',
					} as any,
					'shape:writing-container': {
						x: 0, y: 0, rotation: 0, isLocked: true, opacity: 1, meta: {},
						type: 'writing-container', parentId: PAGE_ID, index: 'a1',
						props: { x: 0, y: 0, w: WRITING_PAGE_WIDTH, h: WRITING_MIN_PAGE_HEIGHT },
						id: 'shape:writing-container', typeName: 'shape',
					} as any,
					...extraShapes as any,
				} as any,
				schema: { schemaVersion: 2, sequences: {} } as any,
			},
			session: {
				version: 0,
				currentPageId: PAGE_ID as any,
				exportBackground: true,
				isFocusMode: false,
				isDebugMode: false,
				isToolLocked: false,
				isGridMode: false,
				pageStates: [{ pageId: PAGE_ID as any, camera: { x: 0, y: 0, z: 1 }, selectedShapeIds: [], focusedGroupId: null }],
			},
		},
		svgString: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs/></svg>',
	};
}

function makeDrawingFileData(extraShapes: Record<string, unknown> = {}): InkFileData {
	return {
		meta: {
			pluginVersion: '1.0.0',
			tldrawVersion: '2.1.0',
			fileType: 'inkDrawing',
		},
		tldraw: {
			document: {
				store: {
					'document:document': { gridSize: 10, name: '', meta: {}, id: 'document:document', typeName: 'document' } as any,
					[PAGE_ID]: { meta: {}, id: PAGE_ID, name: 'Drawing', index: 'a1', typeName: 'page' } as any,
					...extraShapes as any,
				} as any,
				schema: { schemaVersion: 2, sequences: {} } as any,
			},
			session: {
				version: 0,
				currentPageId: PAGE_ID as any,
				exportBackground: true,
				isFocusMode: false,
				isDebugMode: false,
				isToolLocked: false,
				isGridMode: false,
				pageStates: [{ pageId: PAGE_ID as any, camera: { x: 0, y: 0, z: 1 }, selectedShapeIds: [], focusedGroupId: null }],
			},
		},
		svgString: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs/></svg>',
	};
}

////////

describe('convertWriteDataToDraw', () => {
	test('updates fileType from inkWriting to inkDrawing', () => {
		const input = makeWritingFileData();
		const result = convertWriteDataToDraw(input);
		expect(result.meta.fileType).toBe('inkDrawing');
	});

	test('removes shape:writing-container from tldraw store', () => {
		const input = makeWritingFileData();
		const result = convertWriteDataToDraw(input);
		expect(store(result)['shape:writing-container']).toBeUndefined();
	});

	test('removes shape:writing-lines from tldraw store', () => {
		const input = makeWritingFileData();
		const result = convertWriteDataToDraw(input);
		expect(store(result)['shape:writing-lines']).toBeUndefined();
	});

	test('preserves draw stroke shapes', () => {
		const stroke = {
			x: 10, y: 20, rotation: 0, isLocked: false, opacity: 1, meta: {},
			type: 'draw', parentId: PAGE_ID, index: 'b1',
			props: { segments: [], color: 'black', dash: 'draw', fill: 'none', size: 'm', isPen: true, isComplete: true, isClosed: false },
			id: 'shape:stroke1', typeName: 'shape',
		};
		const input = makeWritingFileData({ 'shape:stroke1': stroke });
		const result = convertWriteDataToDraw(input);
		expect(store(result)['shape:stroke1']).toEqual(stroke);
	});

	test('preserves other metadata fields', () => {
		const input = makeWritingFileData();
		const result = convertWriteDataToDraw(input);
		expect(result.meta.pluginVersion).toBe(input.meta.pluginVersion);
		expect(result.meta.tldrawVersion).toBe(input.meta.tldrawVersion);
	});

	test('does not mutate the original data', () => {
		const input = makeWritingFileData();
		convertWriteDataToDraw(input);
		expect(store(input)['shape:writing-container']).toBeDefined();
		expect(input.meta.fileType).toBe('inkWriting');
	});

	test('succeeds even when no writing-container shape exists', () => {
		const inputWithoutContainer = makeDrawingFileData();
		const input: InkFileData = {
			...inputWithoutContainer,
			meta: { ...inputWithoutContainer.meta, fileType: 'inkWriting' },
		};
		const result = convertWriteDataToDraw(input);
		expect(result.meta.fileType).toBe('inkDrawing');
		expect(store(result)['shape:writing-container']).toBeUndefined();
	});

	test('round-trip: buildFileStr then extractInkJsonFromSvg preserves fileType', () => {
		const input = makeWritingFileData();
		const converted = convertWriteDataToDraw(input);
		const svgStr = buildFileStr(converted);
		const parsed = extractInkJsonFromSvg(svgStr);
		expect(parsed).not.toBeNull();
		expect(parsed!.meta.fileType).toBe('inkDrawing');
	});

	test('round-trip: tldraw store shapes are preserved after serialize/deserialize', () => {
		const stroke = {
			x: 0, y: 0, rotation: 0, isLocked: false, opacity: 1, meta: {},
			type: 'draw', parentId: PAGE_ID, index: 'b1',
			props: { segments: [], color: 'black', dash: 'draw', fill: 'none', size: 'm', isPen: true, isComplete: true, isClosed: false },
			id: 'shape:strokeRT', typeName: 'shape',
		};
		const input = makeWritingFileData({ 'shape:strokeRT': stroke });
		const converted = convertWriteDataToDraw(input);
		const svgStr = buildFileStr(converted);
		const parsed = extractInkJsonFromSvg(svgStr);
		expect(parsed).not.toBeNull();
		expect(store(parsed!)['shape:strokeRT']).toBeDefined();
		expect(store(parsed!)['shape:writing-container']).toBeUndefined();
	});
});

////////

describe('convertDrawDataToWrite', () => {
	test('updates fileType from inkDrawing to inkWriting', () => {
		const input = makeDrawingFileData();
		const result = convertDrawDataToWrite(input);
		expect(result.meta.fileType).toBe('inkWriting');
	});

	test('adds shape:writing-container to tldraw store', () => {
		const input = makeDrawingFileData();
		const result = convertDrawDataToWrite(input);
		expect(store(result)['shape:writing-container']).toBeDefined();
	});

	test('shape:writing-container has correct default dimensions', () => {
		const input = makeDrawingFileData();
		const result = convertDrawDataToWrite(input);
		const container = store(result)['shape:writing-container'];
		expect(container.props.w).toBe(WRITING_PAGE_WIDTH);
		expect(container.props.h).toBeGreaterThanOrEqual(WRITING_MIN_PAGE_HEIGHT);
	});

	test('adds shape:writing-lines to tldraw store', () => {
		const input = makeDrawingFileData();
		const result = convertDrawDataToWrite(input);
		expect(store(result)['shape:writing-lines']).toBeDefined();
	});

	test('shape:writing-lines has correct default dimensions', () => {
		const input = makeDrawingFileData();
		const result = convertDrawDataToWrite(input);
		const lines = store(result)['shape:writing-lines'];
		expect(lines.props.w).toBe(WRITING_PAGE_WIDTH);
		expect(lines.props.h).toBeGreaterThanOrEqual(WRITING_MIN_PAGE_HEIGHT);
	});

	test('writing-container parentId is set to the page', () => {
		const input = makeDrawingFileData();
		const result = convertDrawDataToWrite(input);
		const container = store(result)['shape:writing-container'];
		expect(container.parentId).toBe(PAGE_ID);
	});

	test('preserves existing draw stroke shapes', () => {
		const stroke = {
			x: 5, y: 10, rotation: 0, isLocked: false, opacity: 1, meta: {},
			type: 'draw', parentId: PAGE_ID, index: 'b1',
			props: { segments: [], color: 'black', dash: 'draw', fill: 'none', size: 'm', isPen: true, isComplete: true, isClosed: false },
			id: 'shape:drawStroke', typeName: 'shape',
		};
		const input = makeDrawingFileData({ 'shape:drawStroke': stroke });
		const result = convertDrawDataToWrite(input);
		expect(store(result)['shape:drawStroke']).toEqual(stroke);
	});

	test('does not mutate the original data', () => {
		const input = makeDrawingFileData();
		convertDrawDataToWrite(input);
		expect(store(input)['shape:writing-container']).toBeUndefined();
		expect(input.meta.fileType).toBe('inkDrawing');
	});

	test('round-trip: buildFileStr then extractInkJsonFromSvg preserves fileType', () => {
		const input = makeDrawingFileData();
		const converted = convertDrawDataToWrite(input);
		const svgStr = buildFileStr(converted);
		const parsed = extractInkJsonFromSvg(svgStr);
		expect(parsed).not.toBeNull();
		expect(parsed!.meta.fileType).toBe('inkWriting');
	});

	test('round-trip: writing shapes survive serialize/deserialize', () => {
		const input = makeDrawingFileData();
		const converted = convertDrawDataToWrite(input);
		const svgStr = buildFileStr(converted);
		const parsed = extractInkJsonFromSvg(svgStr);
		expect(parsed).not.toBeNull();
		expect(store(parsed!)['shape:writing-container']).toBeDefined();
		expect(store(parsed!)['shape:writing-lines']).toBeDefined();
	});
});

////////

describe('svgString preservation (file conversion flow)', () => {
	// Simulates convertWriteFileToDraw: read → extract → convert → buildFileStr(svgStr)
	test('write→draw: visual SVG content is preserved when using full file as svgString', () => {
		const visualContent = '<g><path d="M10 10 L90 90" stroke="black"/></g>';
		const writingSvgStr = buildFileStr(makeWritingFileData());
		const fullSvgWithVisual = writingSvgStr.replace('</svg>', `${visualContent}</svg>`);
		const data = extractInkJsonFromSvg(fullSvgWithVisual);
		expect(data).not.toBeNull();
		const converted = convertWriteDataToDraw(data!);
		const outputStr = buildFileStr({ ...converted, svgString: fullSvgWithVisual });
		expect(outputStr).toContain('M10 10 L90 90');
	});

	// Simulates convertDrawFileToWrite: read → extract → convert → buildFileStr(svgStr)
	test('draw→write: visual SVG content is preserved when using full file as svgString', () => {
		const visualContent = '<g><circle cx="50" cy="50" r="40"/></g>';
		const drawingSvgStr = buildFileStr(makeDrawingFileData());
		const fullSvgWithVisual = drawingSvgStr.replace('</svg>', `${visualContent}</svg>`);
		const data = extractInkJsonFromSvg(fullSvgWithVisual);
		expect(data).not.toBeNull();
		const converted = convertDrawDataToWrite(data!);
		const outputStr = buildFileStr({ ...converted, svgString: fullSvgWithVisual });
		expect(outputStr).toContain('cx="50" cy="50" r="40"');
	});
});

////////

describe('write -> draw -> write round trip', () => {
	test('file type returns to inkWriting after double conversion', () => {
		const input = makeWritingFileData();
		const asDraw = convertWriteDataToDraw(input);
		const asWrite = convertDrawDataToWrite(asDraw);
		expect(asWrite.meta.fileType).toBe('inkWriting');
	});

	test('draw strokes are preserved through double conversion', () => {
		const stroke = {
			x: 0, y: 0, rotation: 0, isLocked: false, opacity: 1, meta: {},
			type: 'draw', parentId: PAGE_ID, index: 'b1',
			props: { segments: [], color: 'black', dash: 'draw', fill: 'none', size: 'm', isPen: true, isComplete: true, isClosed: false },
			id: 'shape:doubleRT', typeName: 'shape',
		};
		const input = makeWritingFileData({ 'shape:doubleRT': stroke });
		const asDraw = convertWriteDataToDraw(input);
		const asWrite = convertDrawDataToWrite(asDraw);
		expect(store(asWrite)['shape:doubleRT']).toBeDefined();
	});
});
