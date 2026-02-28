import { describe, expect, test } from '@jest/globals';
import {
	findLegacyEmbedBlocks,
	replaceLegacyBlockInMarkdown,
	convertLegacyJsonToInkFileData,
	getLegacySvgPath,
	LegacyEmbedBlock,
} from 'src/logic/utils/migration-logic';
import { buildFileStr } from 'src/components/formats/current/utils/buildFileStr';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { InkFileData } from 'src/components/formats/current/types/file-data';

// SerializedStore<TLRecord> only allows known record IDs as keys; cast when
// tests need to access shapes by arbitrary string key.
function store(data: InkFileData): Record<string, any> {
	return data.tldraw.document.store as unknown as Record<string, any>;
}

////////
////////

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeV1WriteJson(filepath: string): string {
	return JSON.stringify({
		meta: { pluginVersion: '0.3.0', tldrawVersion: '2.1.0' },
		tldraw: {
			document: {
				store: {
					'document:document': { gridSize: 10, name: '', meta: {}, id: 'document:document', typeName: 'document' },
					'page:writing': { meta: {}, id: 'page:writing', name: 'Handwritten Note', index: 'a1', typeName: 'page' },
					'shape:writing-container': {
						x: 0, y: 0, rotation: 0, isLocked: true, opacity: 1, meta: {},
						type: 'writing-container', parentId: 'page:writing', index: 'a1',
						props: { x: 0, y: 0, w: 2000, h: 225 }, id: 'shape:writing-container', typeName: 'shape',
					},
					'shape:writing-lines': {
						x: 0, y: 0, rotation: 0, isLocked: true, opacity: 1, meta: {},
						type: 'writing-lines', parentId: 'page:writing', index: 'a1',
						props: { x: 0, y: 0, w: 2000, h: 225 }, id: 'shape:writing-lines', typeName: 'shape',
					},
				},
				schema: { schemaVersion: 2, sequences: {} },
			},
			session: {
				version: 0, currentPageId: 'page:writing', exportBackground: true,
				pageStates: [{ pageId: 'page:writing', camera: { x: 0, y: 0, z: 1 }, selectedShapeIds: [] }],
			},
		},
	});
}

function makeV1DrawJson(filepath: string): string {
	return JSON.stringify({
		meta: { pluginVersion: '0.3.0', tldrawVersion: '2.1.0' },
		tldraw: {
			document: {
				store: {
					'document:document': { gridSize: 10, name: '', meta: {}, id: 'document:document', typeName: 'document' },
					'page:drawing': { meta: {}, id: 'page:drawing', name: 'Drawing', index: 'a1', typeName: 'page' },
				},
				schema: { schemaVersion: 2, sequences: {} },
			},
			session: {
				version: 0, currentPageId: 'page:drawing', exportBackground: true,
				pageStates: [{ pageId: 'page:drawing', camera: { x: 0, y: 0, z: 1 }, selectedShapeIds: [] }],
			},
		},
	});
}

function wrapInCodeBlock(key: string, json: string): string {
	return '```' + key + '\n' + json + '\n```';
}

const WRITE_KEY = 'handwritten-ink';
const DRAW_KEY = 'handdrawn-ink';

////////

describe('findLegacyEmbedBlocks', () => {
	test('finds a single legacy writing embed', () => {
		const json = JSON.stringify({ versionAtEmbed: '1.0.0', filepath: 'Ink/Writing/note.writing' });
		const markdown = 'Some text\n' + wrapInCodeBlock(WRITE_KEY, json) + '\nMore text';
		const results = findLegacyEmbedBlocks(markdown);
		expect(results).toHaveLength(1);
		expect(results[0].embedType).toBe('writing');
		expect(results[0].filepath).toBe('Ink/Writing/note.writing');
	});

	test('finds a single legacy drawing embed', () => {
		const json = JSON.stringify({ versionAtEmbed: '1.0.0', filepath: 'Ink/Drawing/sketch.drawing', width: 500, aspectRatio: 1 });
		const markdown = wrapInCodeBlock(DRAW_KEY, json);
		const results = findLegacyEmbedBlocks(markdown);
		expect(results).toHaveLength(1);
		expect(results[0].embedType).toBe('drawing');
		expect(results[0].filepath).toBe('Ink/Drawing/sketch.drawing');
	});

	test('finds multiple legacy embeds in one note', () => {
		const json1 = JSON.stringify({ versionAtEmbed: '1.0.0', filepath: 'Ink/Writing/a.writing' });
		const json2 = JSON.stringify({ versionAtEmbed: '1.0.0', filepath: 'Ink/Writing/b.writing' });
		const json3 = JSON.stringify({ versionAtEmbed: '1.0.0', filepath: 'Ink/Drawing/c.drawing' });
		const markdown = [
			wrapInCodeBlock(WRITE_KEY, json1),
			'\nSome content\n',
			wrapInCodeBlock(WRITE_KEY, json2),
			'\n',
			wrapInCodeBlock(DRAW_KEY, json3),
		].join('');
		const results = findLegacyEmbedBlocks(markdown);
		expect(results).toHaveLength(3);
	});

	test('returns empty array when no legacy embeds', () => {
		const markdown = '# My Note\n\nJust some text without any embeds.';
		const results = findLegacyEmbedBlocks(markdown);
		expect(results).toHaveLength(0);
	});

	test('does not match current format v2 embeds', () => {
		const markdown = '\n ![InkWriting](<Ink/Writing/note.svg>) [Edit Writing](https://youtu.be/2arL1jh8ihA?type=inkWriting&version=1)\n';
		const results = findLegacyEmbedBlocks(markdown);
		expect(results).toHaveLength(0);
	});

	test('mixed legacy and current embeds - only finds legacy', () => {
		const legacyJson = JSON.stringify({ versionAtEmbed: '1.0.0', filepath: 'Ink/Writing/legacy.writing' });
		const currentEmbed = '\n ![InkWriting](<Ink/Writing/current.svg>) [Edit Writing](https://youtu.be/2arL1jh8ihA?type=inkWriting&version=1)\n';
		const markdown = wrapInCodeBlock(WRITE_KEY, legacyJson) + '\n' + currentEmbed;
		const results = findLegacyEmbedBlocks(markdown);
		expect(results).toHaveLength(1);
		expect(results[0].filepath).toBe('Ink/Writing/legacy.writing');
	});

	test('skips code blocks with malformed JSON gracefully', () => {
		const markdown = '```' + WRITE_KEY + '\n{bad json here}\n```';
		expect(() => findLegacyEmbedBlocks(markdown)).not.toThrow();
		const results = findLegacyEmbedBlocks(markdown);
		expect(results).toHaveLength(0);
	});

	test('skips code blocks with missing filepath gracefully', () => {
		const json = JSON.stringify({ versionAtEmbed: '1.0.0' }); // no filepath
		const markdown = wrapInCodeBlock(WRITE_KEY, json);
		const results = findLegacyEmbedBlocks(markdown);
		expect(results).toHaveLength(0);
	});

	test('fullMatch contains the entire code block text', () => {
		const json = JSON.stringify({ versionAtEmbed: '1.0.0', filepath: 'Ink/Writing/note.writing' });
		const block = wrapInCodeBlock(WRITE_KEY, json);
		const results = findLegacyEmbedBlocks(block);
		expect(results[0].fullMatch).toBe(block);
	});
});

////////

describe('getLegacySvgPath', () => {
	test('replaces .writing extension with .svg', () => {
		expect(getLegacySvgPath('Ink/Writing/note.writing')).toBe('Ink/Writing/note.svg');
	});

	test('replaces .drawing extension with .svg', () => {
		expect(getLegacySvgPath('Ink/Drawing/sketch.drawing')).toBe('Ink/Drawing/sketch.svg');
	});

	test('handles paths with dots in directory names', () => {
		expect(getLegacySvgPath('my.folder/note.writing')).toBe('my.folder/note.svg');
	});

	test('handles file with no extension', () => {
		expect(getLegacySvgPath('Ink/Writing/note')).toBe('Ink/Writing/note.svg');
	});
});

////////

describe('convertLegacyJsonToInkFileData', () => {
	test('converts a writing file JSON to inkWriting InkFileData', () => {
		const json = makeV1WriteJson('Ink/Writing/note.writing');
		const result = convertLegacyJsonToInkFileData(json, 'writing');
		expect(result).not.toBeNull();
		expect(result!.meta.fileType).toBe('inkWriting');
	});

	test('converts a drawing file JSON to inkDrawing InkFileData', () => {
		const json = makeV1DrawJson('Ink/Drawing/sketch.drawing');
		const result = convertLegacyJsonToInkFileData(json, 'drawing');
		expect(result).not.toBeNull();
		expect(result!.meta.fileType).toBe('inkDrawing');
	});

	test('preserves tldraw snapshot store from v1 file', () => {
		const json = makeV1WriteJson('note.writing');
		const result = convertLegacyJsonToInkFileData(json, 'writing');
		expect(store(result!)['shape:writing-container']).toBeDefined();
	});

	test('sets previewIsOutdated to true', () => {
		const json = makeV1WriteJson('note.writing');
		const result = convertLegacyJsonToInkFileData(json, 'writing');
		expect(result!.meta.previewIsOutdated).toBe(true);
	});

	test('returns null for invalid JSON', () => {
		const result = convertLegacyJsonToInkFileData('{bad json}', 'writing');
		expect(result).toBeNull();
	});

	test('returns null for JSON missing tldraw field', () => {
		const json = JSON.stringify({ meta: { pluginVersion: '1.0.0', tldrawVersion: '2.1.0' } });
		const result = convertLegacyJsonToInkFileData(json, 'writing');
		expect(result).toBeNull();
	});

	test('output is a valid InkFileData that can be built to SVG and parsed back', () => {
		const json = makeV1WriteJson('note.writing');
		const fileData = convertLegacyJsonToInkFileData(json, 'writing');
		expect(fileData).not.toBeNull();
		// Override the SVG mock stub with a real SVG for the round-trip test
		fileData!.svgString = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs/></svg>';
		const svgStr = buildFileStr(fileData!);
		const parsed = extractInkJsonFromSvg(svgStr);
		expect(parsed).not.toBeNull();
		expect(parsed!.meta.fileType).toBe('inkWriting');
	});

	test('writing output preserves writing shapes in tldraw store', () => {
		const json = makeV1WriteJson('note.writing');
		const fileData = convertLegacyJsonToInkFileData(json, 'writing');
		expect(fileData).not.toBeNull();
		fileData!.svgString = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs/></svg>';
		const svgStr = buildFileStr(fileData!);
		const parsed = extractInkJsonFromSvg(svgStr);
		expect(parsed).not.toBeNull();
		expect(store(parsed!)['shape:writing-container']).toBeDefined();
		expect(store(parsed!)['shape:writing-lines']).toBeDefined();
	});

	test('drawing output has no writing shapes in tldraw store', () => {
		const json = makeV1DrawJson('sketch.drawing');
		const fileData = convertLegacyJsonToInkFileData(json, 'drawing');
		expect(store(fileData!)['shape:writing-container']).toBeUndefined();
		expect(store(fileData!)['shape:writing-lines']).toBeUndefined();
	});
});

////////

describe('replaceLegacyBlockInMarkdown', () => {
	test('replaces the legacy code block with new embed text', () => {
		const json = JSON.stringify({ versionAtEmbed: '1.0.0', filepath: 'Ink/Writing/note.writing' });
		const block = wrapInCodeBlock(WRITE_KEY, json);
		const markdown = 'Before\n' + block + '\nAfter';
		const [found] = findLegacyEmbedBlocks(markdown);
		const newEmbed = '![InkWriting](<Ink/Writing/note.svg>) [Edit Writing](https://youtu.be/2arL1jh8ihA?type=inkWriting&version=1)';
		const result = replaceLegacyBlockInMarkdown(markdown, found, newEmbed);
		expect(result).not.toContain('```' + WRITE_KEY);
		expect(result).toContain('![InkWriting]');
	});

	test('preserves surrounding content exactly', () => {
		const json = JSON.stringify({ versionAtEmbed: '1.0.0', filepath: 'Ink/Writing/note.writing' });
		const block = wrapInCodeBlock(WRITE_KEY, json);
		const markdown = 'Before text\n' + block + '\nAfter text';
		const [found] = findLegacyEmbedBlocks(markdown);
		const result = replaceLegacyBlockInMarkdown(markdown, found, 'REPLACEMENT');
		expect(result).toContain('Before text');
		expect(result).toContain('After text');
	});

	test('replaces all occurrences of the same block when duplicated', () => {
		const json = JSON.stringify({ versionAtEmbed: '1.0.0', filepath: 'Ink/Writing/note.writing' });
		const block = wrapInCodeBlock(WRITE_KEY, json);
		const markdown = block + '\n' + block;
		const [found] = findLegacyEmbedBlocks(markdown);
		const result = replaceLegacyBlockInMarkdown(markdown, found, 'REPLACEMENT');
		expect(result).not.toContain('```' + WRITE_KEY);
		// Both occurrences replaced
		expect(result.split('REPLACEMENT').length - 1).toBe(2);
	});

	test('does not modify content when block is not found', () => {
		const markdown = 'No embeds here.';
		const fakeBlock: LegacyEmbedBlock = { fullMatch: '```nonexistent\n{}\n```', embedType: 'writing', filepath: 'x.writing' };
		const result = replaceLegacyBlockInMarkdown(markdown, fakeBlock, 'REPLACEMENT');
		expect(result).toBe(markdown);
	});
});
