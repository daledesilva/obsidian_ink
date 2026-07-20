/**
 * Safety-focused tests for legacy migration and write/draw conversion.
 * Covers relative embed paths, isolation from unrelated vault files, and folder/move behaviour.
 */

jest.mock('src/components/formats/current/utils/convertWriteFileToDraw', () => ({
	convertWriteFileToDraw: jest.fn(),
}));
jest.mock('src/components/formats/current/utils/convertDrawFileToWrite', () => ({
	convertDrawFileToWrite: jest.fn(),
}));
jest.mock('src/components/formats/current/utils/duplicate-files', () => ({
	duplicateDrawingFile: jest.fn(),
	duplicateWritingFile: jest.fn(),
}));

import * as fs from 'fs';
import * as path from 'path';
import { FileManager, TFile } from 'obsidian';
import { buildWritingEmbed, buildDrawingEmbed } from 'src/components/formats/current/utils/build-embeds';
import {
	findNotesContainingFileEmbed,
	executeFileConversion,
	FILE_CONVERSION_IN_PLACE,
} from 'src/logic/utils/convert-file-embeds';
import {
	executeMigration,
	findLegacyEmbedBlocks,
	VaultScanResult,
} from 'src/logic/utils/migration-logic';
import { getDrawingSubfolderPath, getWritingSubfolderPath } from 'src/logic/utils/getSubfolderPaths';
import { findV2InkEmbedRefs } from 'src/logic/utils/tldraw-svg-migration-logic';
import { convertWriteFileToDraw } from 'src/components/formats/current/utils/convertWriteFileToDraw';
import { DEFAULT_SETTINGS } from 'src/types/plugin-settings';

const LEGACY_WRITING_FIXTURE = path.join(
	__dirname,
	'../../../qa-test-vault/fixtures/legacy-writing-fixture.writing',
);

function writingLine(svgPath: string): string {
	return buildWritingEmbed(svgPath);
}

function drawingLine(svgPath: string): string {
	return buildDrawingEmbed(svgPath);
}

function legacyWriteBlock(filepath: string): string {
	return '```handwritten-ink\n' + JSON.stringify({ versionAtEmbed: '0.3.0', filepath }) + '\n```';
}

function makeVault(files: Record<string, string>, options?: { renameTargetPath?: string }) {
	const renamedPaths = new Map<string, string>();

	return {
		getMarkdownFiles: () => Object.keys(files).map(p => ({ path: p } as TFile)),
		cachedRead: jest.fn(async (f: TFile) => files[f.path] ?? ''),
		read: jest.fn(async (f: TFile) => files[f.path] ?? ''),
		modify: jest.fn(async (f: TFile, content: string) => {
			files[f.path] = content;
		}),
		rename: jest.fn(async (file: TFile, newPath: string) => {
			const content = files[file.path] ?? '';
			delete files[file.path];
			files[newPath] = content;
			renamedPaths.set(file.path, newPath);
		}),
		getFileByPath: jest.fn((filePath: string) => {
			if (files[filePath] !== undefined) {
				return { path: filePath } as TFile;
			}
			return null;
		}),
		getLeavesOfType: () => [],
	};
}

function makePlugin(vault: ReturnType<typeof makeVault>, settings: Record<string, unknown> = {}) {
	return {
		app: {
			vault,
			workspace: { getLeavesOfType: () => [] },
		},
		settings: {
			customAttachmentFolders: false,
			writingSubfolder: DEFAULT_SETTINGS.writingSubfolder,
			drawingSubfolder: DEFAULT_SETTINGS.drawingSubfolder,
			...settings,
		},
	} as any;
}

function fileManagerFor(vault: { delete: (file: TFile) => Promise<unknown> }) {
		return { trashFile: (file: TFile) => vault.delete(file) } as FileManager;
	}

	function makeLegacyVault(
	noteContents: Record<string, string>,
	legacyJsonByPath: Record<string, string>,
) {
	const created: Record<string, string> = {};
	const deleted: string[] = [];

	return {
		read: jest.fn(async (f: TFile) => {
			if (legacyJsonByPath[f.path]) return legacyJsonByPath[f.path];
			return noteContents[f.path] ?? '';
		}),
		create: jest.fn(async (filePath: string, content: string) => {
			created[filePath] = content;
		}),
		createFolder: jest.fn(async () => {}),
		delete: jest.fn(async (f: TFile) => {
			deleted.push(f.path);
		}),
		modify: jest.fn(async (f: TFile, content: string) => {
			noteContents[f.path] = content;
		}),
		getAbstractFileByPath: jest.fn(() => null),
		getMarkdownFiles: () => Object.keys(noteContents).map(p => ({ path: p } as TFile)),
		_created: created,
		_deleted: deleted,
	};
}

describe('migration and conversion safety', () => {
	describe('relative embed paths', () => {
		const RELATIVE_WRITING_PATH = '../Ink/Writing/hello.svg';

		it('findNotesContainingFileEmbed matches relative paths stored in markdown', async () => {
			const vault = makeVault({
				'Notes/Sub/Note.md': `# Note\n\n${writingLine(RELATIVE_WRITING_PATH)}\n`,
			});

			const results = await findNotesContainingFileEmbed(
				vault as any,
				RELATIVE_WRITING_PATH,
				'inkWriting',
			);

			expect(results).toHaveLength(1);
			expect(results[0].path).toBe('Notes/Sub/Note.md');
		});

		it('findLegacyEmbedBlocks preserves legacy filepath strings from code blocks', () => {
			const legacyPath = '../Ink/Writing/legacy.writing';
			const markdown = `# Note\n\n${legacyWriteBlock(legacyPath)}\n`;
			const blocks = findLegacyEmbedBlocks(markdown);

			expect(blocks).toHaveLength(1);
			expect(blocks[0].filepath).toBe(legacyPath);
		});

		it('findV2InkEmbedRefs preserves relative SVG paths from image embeds', () => {
			const markdown = `# Note\n\n${writingLine('../Ink/Writing/tldraw.svg')}\n`;
			const refs = findV2InkEmbedRefs(markdown);

			expect(refs).toHaveLength(1);
			expect(refs[0].filepath).toBe('../Ink/Writing/tldraw.svg');
		});
	});

	describe('migration isolation', () => {
		const LEGACY_PATH = 'Ink/Writing/target.writing';
		const OTHER_LEGACY_PATH = 'Ink/Writing/other.writing';
		const NEW_SVG_PATH = 'Ink/Writing/target.svg';

		it('does not delete unrelated legacy files during migration', async () => {
			const legacyJson = fs.readFileSync(LEGACY_WRITING_FIXTURE, 'utf8');
			const noteContents = {
				'Notes/A.md': `# Title\n\n${legacyWriteBlock(LEGACY_PATH)}\n`,
			};
			const vault = makeLegacyVault(noteContents, {
				[LEGACY_PATH]: legacyJson,
				[OTHER_LEGACY_PATH]: legacyJson,
			});

			const scanResult: VaultScanResult = {
				legacyFiles: [{
					legacyFile: { path: LEGACY_PATH } as TFile,
					fileType: 'writing',
					newSvgPath: NEW_SVG_PATH,
					referencingNotes: [],
				}],
				affectedNotes: [],
			};

			await executeMigration(vault as any, fileManagerFor(vault), scanResult);

			expect(vault._deleted).toEqual([LEGACY_PATH]);
			expect(vault._deleted).not.toContain(OTHER_LEGACY_PATH);
		});

		it('does not modify notes that do not reference the migrated legacy file', async () => {
			const legacyJson = fs.readFileSync(LEGACY_WRITING_FIXTURE, 'utf8');
			const unrelatedNotePath = 'Notes/Unrelated.md';
			const noteContents = {
				'Notes/Target.md': `# Title\n\n${legacyWriteBlock(LEGACY_PATH)}\n`,
				[unrelatedNotePath]: `# Other\n\nNo legacy embed here.\n`,
			};
			const vault = makeLegacyVault(noteContents, { [LEGACY_PATH]: legacyJson });

			const scanResult: VaultScanResult = {
				legacyFiles: [{
					legacyFile: { path: LEGACY_PATH } as TFile,
					fileType: 'writing',
					newSvgPath: NEW_SVG_PATH,
					referencingNotes: [{ path: 'Notes/Target.md' } as TFile],
				}],
				affectedNotes: [{ path: 'Notes/Target.md' } as TFile],
			};

			await executeMigration(vault as any, fileManagerFor(vault), scanResult);

			expect(noteContents['Notes/Target.md']).toContain('![InkWriting]');
			expect(noteContents[unrelatedNotePath]).toBe('# Other\n\nNo legacy embed here.\n');
		});

		it('updates embed strings in every note that references the migrated file', async () => {
			const legacyJson = fs.readFileSync(LEGACY_WRITING_FIXTURE, 'utf8');
			const notePaths = ['Notes/A.md', 'Notes/B.md', 'Notes/C.md'];
			const noteContents: Record<string, string> = {};
			for (const notePath of notePaths) {
				noteContents[notePath] = `# Title\n\n${legacyWriteBlock(LEGACY_PATH)}\n\nTrailing text.`;
			}
			const vault = makeLegacyVault(noteContents, { [LEGACY_PATH]: legacyJson });

			const scanResult: VaultScanResult = {
				legacyFiles: [{
					legacyFile: { path: LEGACY_PATH } as TFile,
					fileType: 'writing',
					newSvgPath: NEW_SVG_PATH,
					referencingNotes: notePaths.map(p => ({ path: p } as TFile)),
				}],
				affectedNotes: notePaths.map(p => ({ path: p } as TFile)),
			};

			const result = await executeMigration(vault as any, fileManagerFor(vault), scanResult);

			expect(result.updatedNotes).toBe(3);
			expect(result.updatedNotePaths).toEqual(expect.arrayContaining(notePaths));
			for (const notePath of notePaths) {
				expect(noteContents[notePath]).toContain('![InkWriting]');
				expect(noteContents[notePath]).toContain(NEW_SVG_PATH);
				expect(noteContents[notePath]).not.toContain('```handwritten-ink');
				expect(noteContents[notePath]).not.toContain(LEGACY_PATH);
			}
		});

		it('converts every legacy embed of the same file when a note embeds it multiple times', async () => {
			const legacyJson = fs.readFileSync(LEGACY_WRITING_FIXTURE, 'utf8');
			const duplicatedBlock = legacyWriteBlock(LEGACY_PATH);
			const noteContents = {
				'Notes/Duplicates.md':
					`# Duplicates\n\nFirst:\n${duplicatedBlock}\n\nSecond:\n${duplicatedBlock}\n\nDone.\n`,
			};
			const vault = makeLegacyVault(noteContents, { [LEGACY_PATH]: legacyJson });

			expect(findLegacyEmbedBlocks(noteContents['Notes/Duplicates.md'])).toHaveLength(2);

			const scanResult: VaultScanResult = {
				legacyFiles: [{
					legacyFile: { path: LEGACY_PATH } as TFile,
					fileType: 'writing',
					newSvgPath: NEW_SVG_PATH,
					referencingNotes: [{ path: 'Notes/Duplicates.md' } as TFile],
				}],
				affectedNotes: [{ path: 'Notes/Duplicates.md' } as TFile],
			};

			await executeMigration(vault as any, fileManagerFor(vault), scanResult);

			const updated = noteContents['Notes/Duplicates.md'];
			expect(updated).not.toContain('```handwritten-ink');
			expect(updated).not.toContain(LEGACY_PATH);
			expect(updated.split('![InkWriting]').length - 1).toBe(2);
			expect(updated.split(NEW_SVG_PATH).length - 1).toBe(2);
			expect(updated).toContain('First:');
			expect(updated).toContain('Second:');
			expect(updated).toContain('Done.');
		});
	});

	describe('file conversion isolation and moves', () => {
		const SVG_PATH = 'Ink/Writing/file.svg';
		const MOVED_PATH = 'Attachments/file.svg';

		it('does not modify notes that do not embed the converted file', async () => {
			const vault = makeVault({
				'Notes/A.md': `# A\n\n${writingLine(SVG_PATH)}\n`,
				'Notes/B.md': `# B\n\n${writingLine('Ink/Writing/other.svg')}\n`,
			});
			const plugin = makePlugin(vault);
			const svgFile = { path: SVG_PATH } as TFile;

			await executeFileConversion(
				plugin,
				svgFile,
				'inkDrawing',
				[{ path: 'Notes/A.md' } as TFile],
				null,
				FILE_CONVERSION_IN_PLACE,
				jest.fn(),
			);

			expect(vault.modify).toHaveBeenCalledTimes(1);
			const modifiedNotePath = (vault.modify as jest.Mock).mock.calls[0][0].path;
			expect(modifiedNotePath).toBe('Notes/A.md');
			const untouched = await vault.read({ path: 'Notes/B.md' } as TFile);
			expect(untouched).toContain('Ink/Writing/other.svg');
			expect(untouched).toContain('InkWriting');
		});

		it('renames the SVG and updates embeds when moveToPath is provided', async () => {
			const vault = makeVault({
				[SVG_PATH]: '<svg></svg>',
				'Notes/A.md': `# A\n\n${writingLine(SVG_PATH)}\n`,
			});
			const plugin = makePlugin(vault);
			const svgFile = { path: SVG_PATH } as TFile;
			(convertWriteFileToDraw as jest.Mock).mockResolvedValueOnce(undefined);

			const result = await executeFileConversion(
				plugin,
				svgFile,
				'inkDrawing',
				[{ path: 'Notes/A.md' } as TFile],
				MOVED_PATH,
				FILE_CONVERSION_IN_PLACE,
				jest.fn(),
			);

			expect(vault.rename).toHaveBeenCalledWith(svgFile, MOVED_PATH);
			expect(convertWriteFileToDraw).toHaveBeenCalled();
			expect(result.finalFile?.path).toBe(MOVED_PATH);
			const updatedNote = await vault.read({ path: 'Notes/A.md' } as TFile);
			expect(updatedNote).toContain(MOVED_PATH);
			expect(updatedNote).not.toContain(SVG_PATH);
			expect(updatedNote).toContain('InkDrawing');
		});

		it('does not change drawing embed lines when converting an unrelated writing file', async () => {
			const drawingPath = 'Ink/Drawing/sketch.svg';
			const vault = makeVault({
				'Notes/Mixed.md': `# Mixed\n\n${writingLine(SVG_PATH)}\n${drawingLine(drawingPath)}\n`,
			});
			const plugin = makePlugin(vault);
			const svgFile = { path: SVG_PATH } as TFile;

			await executeFileConversion(
				plugin,
				svgFile,
				'inkDrawing',
				[{ path: 'Notes/Mixed.md' } as TFile],
				null,
				FILE_CONVERSION_IN_PLACE,
				jest.fn(),
			);

			const updated = await vault.read({ path: 'Notes/Mixed.md' } as TFile);
			expect(updated).toContain(drawingPath);
			expect(updated).toContain('InkDrawing');
			expect(updated).not.toContain(`![InkWriting](<${SVG_PATH}>)`);
		});
	});

	describe('plugin folder settings', () => {
		it('uses custom writing subfolder when customAttachmentFolders is enabled', () => {
			const plugin = makePlugin(makeVault({}), {
				customAttachmentFolders: true,
				writingSubfolder: 'Custom/Writing',
			});

			expect(getWritingSubfolderPath(plugin)).toBe('Custom/Writing');
		});

		it('uses custom drawing subfolder when customAttachmentFolders is enabled', () => {
			const plugin = makePlugin(makeVault({}), {
				customAttachmentFolders: true,
				drawingSubfolder: 'Custom/Drawing',
			});

			expect(getDrawingSubfolderPath(plugin)).toBe('Custom/Drawing');
		});

		it('falls back to defaults when custom folders are disabled', () => {
			const plugin = makePlugin(makeVault({}), {
				customAttachmentFolders: false,
				writingSubfolder: 'ignored',
				drawingSubfolder: 'ignored',
			});

			expect(getWritingSubfolderPath(plugin)).toBe(DEFAULT_SETTINGS.writingSubfolder);
			expect(getDrawingSubfolderPath(plugin)).toBe(DEFAULT_SETTINGS.drawingSubfolder);
		});
	});
});
