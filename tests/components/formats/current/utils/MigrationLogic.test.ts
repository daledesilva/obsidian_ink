import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, test } from '@jest/globals';
import { TFile } from 'obsidian';
import {
	findLegacyEmbedBlocks,
	replaceLegacyBlockInMarkdown,
	convertLegacyToInkCanvasFileData,
	convertLegacyJsonToInkFileData,
	getLegacySvgPath,
	getTestRunSvgPath,
	buildTestRunSvgPathMap,
	INK_TEST_CONVERSIONS_FOLDER,
	scanVaultForLegacyEmbeds,
	vaultHasLegacyInkFiles,
	getLegacyInkFileType,
	executeMigration,
	VaultScanResult,
	LegacyEmbedBlock,
} from 'src/logic/utils/migration-logic';
import { buildFileStr } from 'src/components/formats/current/utils/buildFileStr';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { isInkCanvasFile } from 'src/components/formats/current/utils/ink-file-storage-engine';
import { INK_CANVAS_FORMAT_VERSION } from 'src/constants';
import { buildDrawingEmbedSettingsFromStrokes } from 'src/logic/utils/build-drawing-embed-settings-from-file';
import { DEFAULT_EMBED_SETTINGS } from 'src/types/embed-settings';

const LEGACY_WRITING_FIXTURE = path.join(
	__dirname,
	'../../../../../qa-test-vault/fixtures/legacy-writing-fixture.writing',
);
const LEGACY_DRAWING_FIXTURE = path.join(
	__dirname,
	'../../../../../qa-test-vault/fixtures/legacy-drawing-fixture.drawing',
);

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
		const markdown = '\n ![InkWriting](<Ink/Writing/note.svg>) [Edit Writing](https://youtu.be/2arL1jh8ihA?type=inkWriting)\n';
		const results = findLegacyEmbedBlocks(markdown);
		expect(results).toHaveLength(0);
	});

	test('mixed legacy and current embeds - only finds legacy', () => {
		const legacyJson = JSON.stringify({ versionAtEmbed: '1.0.0', filepath: 'Ink/Writing/legacy.writing' });
		const currentEmbed = '\n ![InkWriting](<Ink/Writing/current.svg>) [Edit Writing](https://youtu.be/2arL1jh8ihA?type=inkWriting)\n';
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

describe('scanVaultForLegacyEmbeds', () => {
	const LEGACY_PATH = 'Ink/Writing/note.writing';

	function makeTFile(path: string): TFile {
		const file = new TFile();
		(file as any).path = path;
		const dotIndex = path.lastIndexOf('.');
		(file as any).extension = dotIndex >= 0 ? path.substring(dotIndex + 1) : '';
		return file;
	}

	function makeScanVault(
		noteContents: Record<string, string>,
		existingLegacyPaths: string[] = [LEGACY_PATH],
	) {
		const notePaths = Object.keys(noteContents);
		const legacyFiles = existingLegacyPaths.map((p) => makeTFile(p));
		const legacyFileByPath = Object.fromEntries(
			legacyFiles.map((f) => [f.path, f]),
		);
		return {
			getMarkdownFiles: () => notePaths.map((p) => makeTFile(p)),
			getFiles: () => legacyFiles,
			read: jest.fn(async (note: TFile) => noteContents[note.path] ?? ''),
			getAbstractFileByPath: jest.fn((path: string) => legacyFileByPath[path] ?? null),
		};
	}

	test('returns empty when no markdown files', async () => {
		const vault = {
			getMarkdownFiles: () => [],
			getFiles: () => [],
			read: jest.fn(),
			getAbstractFileByPath: jest.fn(),
		};
		const result = await scanVaultForLegacyEmbeds(vault as any);
		expect(result.legacyFiles).toHaveLength(0);
		expect(result.affectedNotes).toHaveLength(0);
	});

	test('returns empty when no legacy files exist in vault', async () => {
		const vault = makeScanVault({
			'Notes/A.md': '# Title\n\nPlain text without embeds.',
			'Notes/B.md': 'More plain text.',
		}, []);
		const result = await scanVaultForLegacyEmbeds(vault as any);
		expect(result.legacyFiles).toHaveLength(0);
		expect(result.affectedNotes).toHaveLength(0);
	});

	test('includes orphan legacy files not referenced by any note embed', async () => {
		const vault = makeScanVault({
			'Notes/A.md': '# Title\n\nPlain text without embeds.',
		});
		const result = await scanVaultForLegacyEmbeds(vault as any);
		expect(result.legacyFiles).toHaveLength(1);
		expect(result.legacyFiles[0].legacyFile.path).toBe(LEGACY_PATH);
		expect(result.affectedNotes).toHaveLength(0);
		expect(result.legacyFiles[0].referencingNotes).toHaveLength(0);
	});

	test('finds one legacy file and one affected note', async () => {
		const noteContent = '# Title\n\n' + wrapInCodeBlock(WRITE_KEY, JSON.stringify({ versionAtEmbed: '1.0.0', filepath: LEGACY_PATH })) + '\n';
		const vault = makeScanVault({ 'Notes/A.md': noteContent });
		const result = await scanVaultForLegacyEmbeds(vault as any);
		expect(result.legacyFiles).toHaveLength(1);
		expect(result.legacyFiles[0].legacyFile.path).toBe(LEGACY_PATH);
		expect(result.legacyFiles[0].fileType).toBe('writing');
		expect(result.affectedNotes).toHaveLength(1);
		expect(result.legacyFiles[0].referencingNotes).toHaveLength(1);
		expect(result.legacyFiles[0].referencingNotes[0].path).toBe('Notes/A.md');
	});

	test('same legacy file referenced from multiple notes', async () => {
		const block = wrapInCodeBlock(WRITE_KEY, JSON.stringify({ versionAtEmbed: '1.0.0', filepath: LEGACY_PATH }));
		const vault = makeScanVault({
			'Notes/A.md': '# A\n\n' + block + '\n',
			'Notes/B.md': '# B\n\n' + block + '\n',
		});
		const result = await scanVaultForLegacyEmbeds(vault as any);
		expect(result.legacyFiles).toHaveLength(1);
		expect(result.legacyFiles[0].referencingNotes).toHaveLength(2);
		expect(result.affectedNotes).toHaveLength(2);
	});

	test('skips legacy file path when it does not exist', async () => {
		const block = wrapInCodeBlock(WRITE_KEY, JSON.stringify({ versionAtEmbed: '1.0.0', filepath: 'Ink/Writing/nonexistent.writing' }));
		const vault = makeScanVault(
			{ 'Notes/A.md': '# A\n\n' + block + '\n' },
			[], // no legacy files exist
		);
		const result = await scanVaultForLegacyEmbeds(vault as any);
		expect(result.legacyFiles).toHaveLength(0);
		expect(result.affectedNotes).toHaveLength(1);
	});

	test('onProgress called with (scanned, total) after each file', async () => {
		const block = wrapInCodeBlock(WRITE_KEY, JSON.stringify({ versionAtEmbed: '1.0.0', filepath: LEGACY_PATH }));
		const vault = makeScanVault({
			'Notes/A.md': '# A\n\n' + block + '\n',
			'Notes/B.md': '# B\n\nPlain text.',
			'Notes/C.md': '# C\n\n' + block + '\n',
		});
		const progressCalls: [number, number][] = [];
		await scanVaultForLegacyEmbeds(vault as any, (scanned, total) => progressCalls.push([scanned, total]));
		expect(progressCalls).toEqual([[1, 3], [2, 3], [3, 3]]);
	});

	test('read error skips file and continues', async () => {
		const block = wrapInCodeBlock(WRITE_KEY, JSON.stringify({ versionAtEmbed: '1.0.0', filepath: LEGACY_PATH }));
		const noteContents: Record<string, string> = {
			'Notes/A.md': '# A\n\n' + block + '\n',
			'Notes/B.md': '# B\n\n' + block + '\n',
		};
		const vault = makeScanVault(noteContents);
		(vault.read as jest.Mock).mockImplementation(async (note: TFile) => {
			if (note.path === 'Notes/A.md') throw new Error('permission denied');
			return noteContents[note.path] ?? '';
		});
		const progressCalls: [number, number][] = [];
		const result = await scanVaultForLegacyEmbeds(vault as any, (s, t) => progressCalls.push([s, t]));
		expect(progressCalls).toEqual([[1, 2], [2, 2]]);
		expect(result.legacyFiles).toHaveLength(1);
		expect(result.affectedNotes).toHaveLength(1);
		expect(result.affectedNotes[0].path).toBe('Notes/B.md');
	});
});

describe('vaultHasLegacyInkFiles', () => {
	test('returns true when vault has .writing or .drawing files', () => {
		const vault = {
			getFiles: () => [
				{ extension: 'writing', path: 'Ink/Writing/note.writing' },
				{ extension: 'md', path: 'Notes/A.md' },
			],
		};
		expect(vaultHasLegacyInkFiles(vault as any)).toBe(true);
	});

	test('returns false when vault has no legacy ink files', () => {
		const vault = {
			getFiles: () => [
				{ extension: 'svg', path: 'Ink/Writing/note.svg' },
				{ extension: 'md', path: 'Notes/A.md' },
			],
		};
		expect(vaultHasLegacyInkFiles(vault as any)).toBe(false);
	});
});

describe('getLegacyInkFileType', () => {
	test('maps extensions to file types', () => {
		expect(getLegacyInkFileType('Ink/Writing/note.writing')).toBe('writing');
		expect(getLegacyInkFileType('Ink/Drawing/note.drawing')).toBe('drawing');
		expect(getLegacyInkFileType('Ink/Writing/note.svg')).toBeNull();
	});
});

////////

describe('convertLegacyToInkCanvasFileData', () => {
	test('converts a writing file JSON to inkWriting ink-canvas InkFileData', () => {
		const json = makeV1WriteJson('Ink/Writing/note.writing');
		const result = convertLegacyToInkCanvasFileData(json, 'writing');
		expect(result).not.toBeNull();
		expect(result!.meta.fileType).toBe('inkWriting');
		expect(result!.inkCanvas).toBeDefined();
	});

	test('converts a drawing file JSON to inkDrawing ink-canvas InkFileData', () => {
		const json = makeV1DrawJson('Ink/Drawing/sketch.drawing');
		const result = convertLegacyToInkCanvasFileData(json, 'drawing');
		expect(result).not.toBeNull();
		expect(result!.meta.fileType).toBe('inkDrawing');
		expect(result!.inkCanvas).toBeDefined();
	});

	test('does not set previewIsOutdated when visual SVG is produced', () => {
		const json = fs.readFileSync(LEGACY_WRITING_FIXTURE, 'utf8');
		const result = convertLegacyToInkCanvasFileData(json, 'writing');
		expect(result!.meta.previewIsOutdated).toBeUndefined();
	});

	test('returns null for invalid JSON', () => {
		const result = convertLegacyToInkCanvasFileData('{bad json}', 'writing');
		expect(result).toBeNull();
	});

	test('returns null for JSON missing tldraw field', () => {
		const json = JSON.stringify({ meta: { pluginVersion: '1.0.0', tldrawVersion: '2.1.0' } });
		const result = convertLegacyToInkCanvasFileData(json, 'writing');
		expect(result).toBeNull();
	});

	test('preserves meta.transcript when present', () => {
		const base = JSON.parse(makeV1WriteJson('note.writing'));
		base.meta.transcript = 'some transcript text';
		const json = JSON.stringify(base);
		const result = convertLegacyToInkCanvasFileData(json, 'writing');
		expect(result).not.toBeNull();
		expect(result!.meta.transcript).toBe('some transcript text');
	});

	test('returns null for JSON missing meta field', () => {
		const json = JSON.stringify({ tldraw: JSON.parse(makeV1WriteJson('x')).tldraw });
		const result = convertLegacyToInkCanvasFileData(json, 'writing');
		expect(result).toBeNull();
	});

	test('legacy alias convertLegacyJsonToInkFileData matches ink-canvas converter', () => {
		const json = makeV1WriteJson('note.writing');
		expect(convertLegacyJsonToInkFileData(json, 'writing')).toEqual(
			convertLegacyToInkCanvasFileData(json, 'writing'),
		);
	});

	test('real writing fixture round-trips to ink-canvas SVG on disk', () => {
		const json = fs.readFileSync(LEGACY_WRITING_FIXTURE, 'utf8');
		const fileData = convertLegacyToInkCanvasFileData(json, 'writing');
		expect(fileData).not.toBeNull();
		const svgStr = buildFileStr(fileData!);
		expect(svgStr).toContain(`<ink-canvas version="${INK_CANVAS_FORMAT_VERSION}">`);
		expect(svgStr).not.toContain('<tldraw version=');

		const parsed = extractInkJsonFromSvg(svgStr);
		expect(parsed).not.toBeNull();
		expect(isInkCanvasFile(parsed!)).toBe(true);
		expect(parsed!.meta.fileType).toBe('inkWriting');
		expect(parsed!.inkCanvas!.strokes.length).toBeGreaterThan(0);
	});

	test('real drawing fixture round-trips to ink-canvas SVG on disk', () => {
		const json = fs.readFileSync(LEGACY_DRAWING_FIXTURE, 'utf8');
		const fileData = convertLegacyToInkCanvasFileData(json, 'drawing');
		expect(fileData).not.toBeNull();
		expect(fileData!.inkCanvas!.camera).toBeUndefined();
		const svgStr = buildFileStr(fileData!);
		const parsed = extractInkJsonFromSvg(svgStr);
		expect(parsed).not.toBeNull();
		expect(isInkCanvasFile(parsed!)).toBe(true);
		expect(parsed!.inkCanvas!.strokes.length).toBeGreaterThan(0);
	});

	test('real drawing fixture yields embed viewBox fitted to strokes', () => {
		const json = fs.readFileSync(LEGACY_DRAWING_FIXTURE, 'utf8');
		const fileData = convertLegacyToInkCanvasFileData(json, 'drawing');
		expect(fileData).not.toBeNull();
		const embedSettings = buildDrawingEmbedSettingsFromStrokes(fileData!.inkCanvas!.strokes);
		expect(embedSettings).not.toBeNull();
		expect(embedSettings!.viewBox).not.toEqual(DEFAULT_EMBED_SETTINGS.viewBox);
		expect(embedSettings!.viewBox.x).not.toBe(0);
		expect(embedSettings!.viewBox.y).not.toBe(0);
	});
});

////////

describe('replaceLegacyBlockInMarkdown', () => {
	test('replaces the legacy code block with new embed text', () => {
		const json = JSON.stringify({ versionAtEmbed: '1.0.0', filepath: 'Ink/Writing/note.writing' });
		const block = wrapInCodeBlock(WRITE_KEY, json);
		const markdown = 'Before\n' + block + '\nAfter';
		const [found] = findLegacyEmbedBlocks(markdown);
		const newEmbed = '![InkWriting](<Ink/Writing/note.svg>) [Edit Writing](https://youtu.be/2arL1jh8ihA?type=inkWriting)';
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

// ─── executeMigration ─────────────────────────────────────────────────────────

describe('executeMigration', () => {
	const LEGACY_WRITE_PATH = 'Ink/Writing/note.writing';
	const NEW_SVG_PATH = 'Ink/Writing/note.svg';

	function makeLegacyVault(
		noteContents: Record<string, string>,
		legacyJson: string,
		options?: {
			existingSvgPath?: string;
			createThrows?: boolean;
			deleteThrows?: boolean;
		},
	) {
		const created: Record<string, string> = {};
		const deleted: string[] = [];
		const existingFile = options?.existingSvgPath ? new TFile() : null;
		if (existingFile) (existingFile as any).path = options!.existingSvgPath;

		return {
			read: jest.fn(async (f: TFile) => {
				if (f.path === LEGACY_WRITE_PATH) return legacyJson;
				return noteContents[f.path] ?? '';
			}),
			create: jest.fn(async (path: string, content: string) => {
				if (options?.createThrows) throw new Error('permission denied');
				created[path] = content;
			}),
			createFolder: jest.fn(async (_path: string) => {}),
			delete: jest.fn(async (_f: TFile) => {
				if (options?.deleteThrows) throw new Error('delete failed');
				deleted.push(_f.path);
			}),
			modify: jest.fn(async (_f: TFile, _content: string) => {}),
			getAbstractFileByPath: jest.fn((path: string) =>
				options?.existingSvgPath === path ? existingFile : null,
			),
			_created: created,
			_deleted: deleted,
		};
	}

	function makeNote(path: string): TFile {
		return { path } as TFile;
	}

	function makeLegacyFile(path: string): TFile {
		return { path } as TFile;
	}

	function legacyWriteBlock(filepath: string): string {
		return '```handwritten-ink\n' + JSON.stringify({ versionAtEmbed: '0.3.0', filepath }) + '\n```';
	}

	test('creates SVG with ink-canvas metadata', async () => {
		const legacyJson = fs.readFileSync(LEGACY_WRITING_FIXTURE, 'utf8');
		const noteContents = { 'Notes/A.md': `# Title\n\n${legacyWriteBlock(LEGACY_WRITE_PATH)}\n` };
		const vault = makeLegacyVault(noteContents, legacyJson);

		const scanResult: VaultScanResult = {
			legacyFiles: [{
				legacyFile: makeLegacyFile(LEGACY_WRITE_PATH),
				fileType: 'writing',
				newSvgPath: NEW_SVG_PATH,
				referencingNotes: [],
			}],
			affectedNotes: [],
		};

		await executeMigration(vault as any, scanResult);

		const createdSvg = (vault as any)._created[NEW_SVG_PATH] as string;
		expect(createdSvg).toContain(`<ink-canvas version="${INK_CANVAS_FORMAT_VERSION}">`);
		expect(createdSvg).not.toContain('<tldraw version=');
	});

	test('updates embed strings in ALL affected notes', async () => {
		const notePaths = ['Notes/A.md', 'Notes/B.md', 'Notes/C.md'];
		const noteContents: Record<string, string> = {};
		for (const p of notePaths) {
			noteContents[p] = `# Title\n\n${legacyWriteBlock(LEGACY_WRITE_PATH)}\n\nSome text.`;
		}

		const vault = makeLegacyVault(noteContents, makeV1WriteJson(LEGACY_WRITE_PATH));

		const scanResult: VaultScanResult = {
			legacyFiles: [{
				legacyFile: makeLegacyFile(LEGACY_WRITE_PATH),
				fileType: 'writing',
				newSvgPath: NEW_SVG_PATH,
				referencingNotes: [],
			}],
			affectedNotes: notePaths.map(makeNote),
		};

		await executeMigration(vault as any, scanResult);

		// modify called once per note
		expect(vault.modify).toHaveBeenCalledTimes(3);
		for (const call of (vault.modify as jest.Mock).mock.calls) {
			const content = call[1] as string;
			expect(content).toContain('![InkWriting]');
			expect(content).not.toContain('```handwritten-ink');
		}
	});

	test('returns updatedNotePaths for every updated note', async () => {
		const notePaths = ['Notes/A.md', 'Notes/B.md', 'Notes/C.md'];
		const noteContents: Record<string, string> = {};
		for (const p of notePaths) {
			noteContents[p] = `# Title\n\n${legacyWriteBlock(LEGACY_WRITE_PATH)}\n`;
		}

		const vault = makeLegacyVault(noteContents, makeV1WriteJson(LEGACY_WRITE_PATH));

		const scanResult: VaultScanResult = {
			legacyFiles: [{
				legacyFile: makeLegacyFile(LEGACY_WRITE_PATH),
				fileType: 'writing',
				newSvgPath: NEW_SVG_PATH,
				referencingNotes: [],
			}],
			affectedNotes: notePaths.map(makeNote),
		};

		const result = await executeMigration(vault as any, scanResult);

		expect(result.updatedNotePaths).toHaveLength(3);
		expect(result.updatedNotePaths).toContain('Notes/A.md');
		expect(result.updatedNotePaths).toContain('Notes/B.md');
		expect(result.updatedNotePaths).toContain('Notes/C.md');
	});

	test('does not call modify when affectedNotes is empty', async () => {
		const vault = makeLegacyVault({}, makeV1WriteJson(LEGACY_WRITE_PATH));

		const scanResult: VaultScanResult = {
			legacyFiles: [{
				legacyFile: makeLegacyFile(LEGACY_WRITE_PATH),
				fileType: 'writing',
				newSvgPath: NEW_SVG_PATH,
				referencingNotes: [],
			}],
			affectedNotes: [],
		};

		const result = await executeMigration(vault as any, scanResult);

		expect(vault.modify).not.toHaveBeenCalled();
		expect(result.updatedNotePaths).toHaveLength(0);
	});

	test('skips when target SVG already exists', async () => {
		const noteContents = { 'Notes/A.md': `# Title\n\n${legacyWriteBlock(LEGACY_WRITE_PATH)}\n` };
		const vault = makeLegacyVault(noteContents, makeV1WriteJson(LEGACY_WRITE_PATH), {
			existingSvgPath: NEW_SVG_PATH,
		});

		const scanResult: VaultScanResult = {
			legacyFiles: [{
				legacyFile: makeLegacyFile(LEGACY_WRITE_PATH),
				fileType: 'writing',
				newSvgPath: NEW_SVG_PATH,
				referencingNotes: [],
			}],
			affectedNotes: [makeNote('Notes/A.md')],
		};

		const result = await executeMigration(vault as any, scanResult);

		expect(vault.create).not.toHaveBeenCalled();
		expect(result.skipped).toContain(NEW_SVG_PATH + ' (already exists)');
		expect(result.convertedFiles).toBe(0);
	});

	test('adds to skipped when parse returns null', async () => {
		const noteContents = { 'Notes/A.md': `# Title\n\n${legacyWriteBlock(LEGACY_WRITE_PATH)}\n` };
		const vault = makeLegacyVault(noteContents, '{bad json}');

		const scanResult: VaultScanResult = {
			legacyFiles: [{
				legacyFile: makeLegacyFile(LEGACY_WRITE_PATH),
				fileType: 'writing',
				newSvgPath: NEW_SVG_PATH,
				referencingNotes: [],
			}],
			affectedNotes: [makeNote('Notes/A.md')],
		};

		const result = await executeMigration(vault as any, scanResult);

		expect(vault.create).not.toHaveBeenCalled();
		expect(result.skipped.some((s) => s.includes('could not parse'))).toBe(true);
	});

	test('adds to failed when vault.create throws', async () => {
		const noteContents = { 'Notes/A.md': `# Title\n\n${legacyWriteBlock(LEGACY_WRITE_PATH)}\n` };
		const vault = makeLegacyVault(noteContents, makeV1WriteJson(LEGACY_WRITE_PATH), {
			createThrows: true,
		});

		const scanResult: VaultScanResult = {
			legacyFiles: [{
				legacyFile: makeLegacyFile(LEGACY_WRITE_PATH),
				fileType: 'writing',
				newSvgPath: NEW_SVG_PATH,
				referencingNotes: [],
			}],
			affectedNotes: [makeNote('Notes/A.md')],
		};

		const result = await executeMigration(vault as any, scanResult);

		expect(result.failed.length).toBeGreaterThan(0);
		expect(result.failed[0]).toContain('permission denied');
		expect(result.convertedFiles).toBe(0);
	});

	test('adds to failed when vault.delete throws', async () => {
		const noteContents = { 'Notes/A.md': `# Title\n\n${legacyWriteBlock(LEGACY_WRITE_PATH)}\n` };
		const vault = makeLegacyVault(noteContents, makeV1WriteJson(LEGACY_WRITE_PATH), {
			deleteThrows: true,
		});

		const scanResult: VaultScanResult = {
			legacyFiles: [{
				legacyFile: makeLegacyFile(LEGACY_WRITE_PATH),
				fileType: 'writing',
				newSvgPath: NEW_SVG_PATH,
				referencingNotes: [],
			}],
			affectedNotes: [makeNote('Notes/A.md')],
		};

		const result = await executeMigration(vault as any, scanResult);

		expect(result.failed.length).toBeGreaterThan(0);
		expect(result.failed[0]).toContain('delete failed');
	});

	test('onProgress called with (done, total) after each step', async () => {
		const notePaths = ['Notes/A.md', 'Notes/B.md'];
		const noteContents: Record<string, string> = {};
		for (const p of notePaths) {
			noteContents[p] = `# Title\n\n${legacyWriteBlock(LEGACY_WRITE_PATH)}\n`;
		}
		const vault = makeLegacyVault(noteContents, makeV1WriteJson(LEGACY_WRITE_PATH));

		const scanResult: VaultScanResult = {
			legacyFiles: [{
				legacyFile: makeLegacyFile(LEGACY_WRITE_PATH),
				fileType: 'writing',
				newSvgPath: NEW_SVG_PATH,
				referencingNotes: [],
			}],
			affectedNotes: notePaths.map(makeNote),
		};

		const progressCalls: [number, number][] = [];
		await executeMigration(vault as any, scanResult, (done, total) => progressCalls.push([done, total]));

		expect(progressCalls).toEqual([[1, 3], [2, 3], [3, 3]]);
	});

	test('test run writes to _ink-test-conversions without deleting or updating notes', async () => {
		const legacyJson = fs.readFileSync(LEGACY_WRITING_FIXTURE, 'utf8');
		const noteContents = { 'Notes/A.md': `# Title\n\n${legacyWriteBlock(LEGACY_WRITE_PATH)}\n` };
		const vault = makeLegacyVault(noteContents, legacyJson);
		const testSvgPath = getTestRunSvgPath(LEGACY_WRITE_PATH);

		const scanResult: VaultScanResult = {
			legacyFiles: [{
				legacyFile: makeLegacyFile(LEGACY_WRITE_PATH),
				fileType: 'writing',
				newSvgPath: NEW_SVG_PATH,
				referencingNotes: [],
			}],
			affectedNotes: [makeNote('Notes/A.md')],
		};

		const result = await executeMigration(vault as any, scanResult, undefined, { testRun: true });

		expect(vault.createFolder).toHaveBeenCalledWith(INK_TEST_CONVERSIONS_FOLDER);
		expect(testSvgPath).toBe(`${INK_TEST_CONVERSIONS_FOLDER}/note.svg`);
		expect((vault as any)._created[testSvgPath]).toBeDefined();
		expect((vault as any)._created[NEW_SVG_PATH]).toBeUndefined();
		expect(vault.delete).not.toHaveBeenCalled();
		expect(vault.modify).not.toHaveBeenCalled();
		expect(result.convertedFiles).toBe(1);
		expect(result.updatedNotes).toBe(0);
		expect(result.testRunOutputFolder).toBe(INK_TEST_CONVERSIONS_FOLDER);
	});

	test('test run disambiguates conflicting basenames with _1, _2 suffixes', () => {
		const pathMap = buildTestRunSvgPathMap([
			'Ink/Writing/foo.writing',
			'Ink/Drawing/foo.drawing',
			'Archive/foo.writing',
		]);

		expect(pathMap.get('Ink/Writing/foo.writing')).toBe(`${INK_TEST_CONVERSIONS_FOLDER}/foo.svg`);
		expect(pathMap.get('Ink/Drawing/foo.drawing')).toBe(`${INK_TEST_CONVERSIONS_FOLDER}/foo_1.svg`);
		expect(pathMap.get('Archive/foo.writing')).toBe(`${INK_TEST_CONVERSIONS_FOLDER}/foo_2.svg`);
	});
});
