/**
 * Unit tests for src/logic/utils/convert-file-embeds.ts
 *
 * These tests exercise findNotesContainingFileEmbed and updateEmbedInNote
 * using a lightweight mock vault. No real file I/O or SVG parsing is required.
 */

import { TFile } from 'obsidian';
import {
	findNotesContainingFileEmbed,
	updateEmbedInNote,
} from 'src/logic/utils/convert-file-embeds';
import { buildWritingEmbed, buildDrawingEmbed } from 'src/components/formats/current/utils/build-embeds';

// ─── Mock vault factory ──────────────────────────────────────────────────────

function makeVault(files: Record<string, string>) {
	return {
		getMarkdownFiles: () =>
			Object.keys(files).map((p) => ({ path: p } as TFile)),
		cachedRead: jest.fn(async (f: TFile) => files[f.path] ?? ''),
		read: jest.fn(async (f: TFile) => files[f.path] ?? ''),
		modify: jest.fn(async (_f: TFile, _content: string) => {}),
	};
}

// ─── Embed line helpers ───────────────────────────────────────────────────────
// buildWritingEmbed / buildDrawingEmbed return "\n <line>\n".
// The leading space is significant — the regex inside the functions under test
// requires it. We must not trim() here, so use the full output when building
// note content for fixtures.

function writingLine(path: string): string {
	return buildWritingEmbed(path); // "\n ![InkWriting](<path>) ...\n"
}

function drawingLine(path: string): string {
	return buildDrawingEmbed(path); // "\n ![InkDrawing](<path>) ...\n"
}

// ─── findNotesContainingFileEmbed ─────────────────────────────────────────────

describe('findNotesContainingFileEmbed', () => {
	const WRITING_PATH = 'Ink/Writing/my-note.svg';
	const DRAWING_PATH = 'Ink/Drawing/my-draw.svg';

	it('finds a note that embeds the writing file', async () => {
		const vault = makeVault({
			'Notes/A.md': `# A\n\n${writingLine(WRITING_PATH)}\n`,
		});
		const results = await findNotesContainingFileEmbed(
			vault as any,
			WRITING_PATH,
			'inkWriting',
		);
		expect(results).toHaveLength(1);
		expect(results[0].path).toBe('Notes/A.md');
	});

	it('finds a note that embeds the drawing file', async () => {
		const vault = makeVault({
			'Notes/B.md': `# B\n\n${drawingLine(DRAWING_PATH)}\n`,
		});
		const results = await findNotesContainingFileEmbed(
			vault as any,
			DRAWING_PATH,
			'inkDrawing',
		);
		expect(results).toHaveLength(1);
		expect(results[0].path).toBe('Notes/B.md');
	});

	it('does NOT find a note with a different SVG path', async () => {
		const vault = makeVault({
			'Notes/C.md': `# C\n\n${writingLine('Ink/Writing/other.svg')}\n`,
		});
		const results = await findNotesContainingFileEmbed(
			vault as any,
			WRITING_PATH,
			'inkWriting',
		);
		expect(results).toHaveLength(0);
	});

	it('does NOT find a note with the same path but wrong type (drawing instead of writing)', async () => {
		const vault = makeVault({
			// Note embeds the same path but as InkDrawing
			'Notes/D.md': `# D\n\n${drawingLine(WRITING_PATH)}\n`,
		});
		const results = await findNotesContainingFileEmbed(
			vault as any,
			WRITING_PATH,
			'inkWriting',
		);
		expect(results).toHaveLength(0);
	});

	it('returns only matching notes from a mixed set', async () => {
		const vault = makeVault({
			'Notes/Match1.md': `# M1\n\n${writingLine(WRITING_PATH)}\n`,
			'Notes/Match2.md': `# M2\n\n${writingLine(WRITING_PATH)}\n`,
			'Notes/NoMatch.md': `# NM\n\n${writingLine('Ink/Writing/other.svg')}\n`,
			'Notes/Drawing.md': `# D\n\n${drawingLine(DRAWING_PATH)}\n`,
		});
		const results = await findNotesContainingFileEmbed(
			vault as any,
			WRITING_PATH,
			'inkWriting',
		);
		expect(results).toHaveLength(2);
		const paths = results.map((f) => f.path);
		expect(paths).toContain('Notes/Match1.md');
		expect(paths).toContain('Notes/Match2.md');
	});

	it('calls onProgress once per file with correct (scanned, total) values', async () => {
		const vault = makeVault({
			'Notes/A.md': `${writingLine(WRITING_PATH)}`,
			'Notes/B.md': `${writingLine(WRITING_PATH)}`,
			'Notes/C.md': `# no embed`,
		});
		const calls: [number, number][] = [];
		await findNotesContainingFileEmbed(
			vault as any,
			WRITING_PATH,
			'inkWriting',
			(scanned, total) => calls.push([scanned, total]),
		);
		expect(calls).toEqual([
			[1, 3],
			[2, 3],
			[3, 3],
		]);
	});

	it('skips unreadable files without throwing', async () => {
		const vault = {
			getMarkdownFiles: () => [
				{ path: 'Notes/Good.md' } as TFile,
				{ path: 'Notes/Bad.md' } as TFile,
			],
			cachedRead: jest.fn(async (f: TFile) => {
				if (f.path === 'Notes/Bad.md') throw new Error('permission denied');
				return `${writingLine(WRITING_PATH)}`;
			}),
		};
		const results = await findNotesContainingFileEmbed(
			vault as any,
			WRITING_PATH,
			'inkWriting',
		);
		expect(results).toHaveLength(1);
		expect(results[0].path).toBe('Notes/Good.md');
	});
});

// ─── updateEmbedInNote ────────────────────────────────────────────────────────

describe('updateEmbedInNote', () => {
	const WRITING_PATH = 'Ink/Writing/file.svg';
	const DRAWING_PATH = 'Ink/Drawing/file.svg';

	it('replaces writing embed with drawing embed (same path)', async () => {
		const note = { path: 'Notes/A.md' } as TFile;
		const original = `# Title\n\n${writingLine(WRITING_PATH)}\n\nSome text.`;
		const vault = makeVault({ 'Notes/A.md': original });

		const changed = await updateEmbedInNote(
			vault as any,
			note,
			WRITING_PATH,
			WRITING_PATH,
			'inkDrawing',
		);

		expect(changed).toBe(true);
		const written = (vault.modify as jest.Mock).mock.calls[0][1] as string;
		expect(written).toContain('![InkDrawing]');
		expect(written).not.toContain('![InkWriting]');
	});

	it('replaces drawing embed with writing embed (same path)', async () => {
		const note = { path: 'Notes/B.md' } as TFile;
		const original = `# B\n\n${drawingLine(DRAWING_PATH)}\n`;
		const vault = makeVault({ 'Notes/B.md': original });

		const changed = await updateEmbedInNote(
			vault as any,
			note,
			DRAWING_PATH,
			DRAWING_PATH,
			'inkWriting',
		);

		expect(changed).toBe(true);
		const written = (vault.modify as jest.Mock).mock.calls[0][1] as string;
		expect(written).toContain('![InkWriting]');
		expect(written).not.toContain('![InkDrawing]');
	});

	it('uses the new path when the file has been moved', async () => {
		const note = { path: 'Notes/C.md' } as TFile;
		const original = `# C\n\n${writingLine(WRITING_PATH)}\n`;
		const vault = makeVault({ 'Notes/C.md': original });

		const changed = await updateEmbedInNote(
			vault as any,
			note,
			WRITING_PATH,
			DRAWING_PATH,
			'inkDrawing',
		);

		expect(changed).toBe(true);
		const written = (vault.modify as jest.Mock).mock.calls[0][1] as string;
		expect(written).toContain(DRAWING_PATH);
		expect(written).not.toContain(WRITING_PATH);
	});

	it('returns false and does NOT call modify when no matching embed', async () => {
		const note = { path: 'Notes/D.md' } as TFile;
		const original = `# D\n\nJust some text with no embed.\n`;
		const vault = makeVault({ 'Notes/D.md': original });

		const changed = await updateEmbedInNote(
			vault as any,
			note,
			WRITING_PATH,
			WRITING_PATH,
			'inkDrawing',
		);

		expect(changed).toBe(false);
		expect(vault.modify).not.toHaveBeenCalled();
	});

	it('replaces ALL occurrences of the embed in a note', async () => {
		const note = { path: 'Notes/E.md' } as TFile;
		const line = writingLine(WRITING_PATH);
		const original = `# E\n\n${line}\n\nMiddle content.\n\n${line}\n\nEnd.`;
		const vault = makeVault({ 'Notes/E.md': original });

		await updateEmbedInNote(
			vault as any,
			note,
			WRITING_PATH,
			WRITING_PATH,
			'inkDrawing',
		);

		const written = (vault.modify as jest.Mock).mock.calls[0][1] as string;
		const drawingCount = (written.match(/!\[InkDrawing\]/g) ?? []).length;
		const writingCount = (written.match(/!\[InkWriting\]/g) ?? []).length;
		expect(drawingCount).toBe(2);
		expect(writingCount).toBe(0);
	});

	it('preserves surrounding markdown content exactly', async () => {
		const note = { path: 'Notes/F.md' } as TFile;
		const para1 = 'First paragraph with some text.';
		const para3 = 'Third paragraph after the embed.';
		const original = `${para1}\n\n${writingLine(WRITING_PATH)}\n\n${para3}`;
		const vault = makeVault({ 'Notes/F.md': original });

		await updateEmbedInNote(
			vault as any,
			note,
			WRITING_PATH,
			WRITING_PATH,
			'inkDrawing',
		);

		const written = (vault.modify as jest.Mock).mock.calls[0][1] as string;
		expect(written).toContain(para1);
		expect(written).toContain(para3);
	});
});
