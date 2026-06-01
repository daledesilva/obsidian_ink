import * as fs from 'fs';
import * as path from 'path';
import { buildFileStr } from 'src/components/formats/current/utils/buildFileStr';
import {
	buildInkCanvasDrawingFileData,
	buildInkCanvasWritingFileData,
} from 'src/components/formats/current/utils/build-file-data';
import { isInkCanvasFile } from 'src/components/formats/current/utils/ink-file-storage-engine';
import {
	migrateFromTldraw,
	migrateWritingFromTldraw,
	type TldrawSnapshotForMigration,
} from 'src/ink-canvas/migrate-from-tldraw';
import { renderStrokesToSvg, renderWritingStrokesToSvg } from 'src/ink-canvas/svg-export';
import { INK_CANVAS_FORMAT_VERSION, WRITING_LINE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';

const FIXTURES_DIR = path.join(__dirname, '../../../qa-test-vault/fixtures');
const DRAWING_FIXTURE = path.join(FIXTURES_DIR, 'v2-tldraw-drawing-tasks-priority.svg');
const WRITING_FIXTURE = path.join(FIXTURES_DIR, 'v2-tldraw-writing-llm-text.svg');

function readFixture(filePath: string): string {
	return fs.readFileSync(filePath, 'utf8');
}

describe('v2 tldraw fixture migration', () => {
	describe('drawing fixture', () => {
		const svg = readFixture(DRAWING_FIXTURE);

		test('extracts inkDrawing tldraw payload', () => {
			const data = extractInkJsonFromSvg(svg);
			expect(data).not.toBeNull();
			expect(data!.meta.fileType).toBe('inkDrawing');
			expect(isInkCanvasFile(data!)).toBe(false);
			expect(svg).toContain('<tldraw');
		});

		test('migrates to non-empty ink-canvas snapshot and serializes as ink-canvas', () => {
			const data = extractInkJsonFromSvg(svg)!;
			const migrated = migrateFromTldraw(data.tldraw as unknown as TldrawSnapshotForMigration);
			expect(migrated.strokes.length).toBeGreaterThan(0);

			const svgString = renderStrokesToSvg(migrated.strokes, migrated);
			const upgraded = buildInkCanvasDrawingFileData({
				inkCanvasSnapshot: migrated,
				svgString,
			});
			const out = buildFileStr({ ...upgraded, svgString });
			expect(out).toContain(`<ink-canvas version="${INK_CANVAS_FORMAT_VERSION}">`);

			const parsed = extractInkJsonFromSvg(out);
			expect(parsed).not.toBeNull();
			expect(isInkCanvasFile(parsed!)).toBe(true);
			expect(parsed!.inkCanvas?.strokes.length).toBeGreaterThan(0);
		});
	});

	describe('writing fixture', () => {
		const svg = readFixture(WRITING_FIXTURE);

		test('extracts inkWriting tldraw payload', () => {
			const data = extractInkJsonFromSvg(svg);
			expect(data).not.toBeNull();
			expect(data!.meta.fileType).toBe('inkWriting');
			expect(isInkCanvasFile(data!)).toBe(false);
			expect(svg).toContain('<tldraw');
		});

		test('migrates with line height and serializes as ink-canvas', () => {
			const data = extractInkJsonFromSvg(svg)!;
			const fallbackLineHeight = data.meta.writingLineHeight ?? WRITING_LINE_HEIGHT;
			const migrated = migrateWritingFromTldraw(
				data.tldraw as unknown as TldrawSnapshotForMigration,
				fallbackLineHeight,
			);
			expect(migrated.strokes.length).toBeGreaterThan(10);
			if (data.meta.writingLineHeight != null) {
				expect(migrated.writingLineHeight).toBe(data.meta.writingLineHeight);
			}

			const svgString = renderWritingStrokesToSvg(
				migrated.strokes,
				migrated,
				WRITING_PAGE_WIDTH,
			);
			const upgraded = buildInkCanvasWritingFileData({
				inkCanvasSnapshot: migrated,
				svgString,
			});
			const out = buildFileStr({ ...upgraded, svgString });
			expect(out).toContain(`<ink-canvas version="${INK_CANVAS_FORMAT_VERSION}">`);

			const parsed = extractInkJsonFromSvg(out);
			expect(parsed).not.toBeNull();
			expect(isInkCanvasFile(parsed!)).toBe(true);
			expect(parsed!.inkCanvas?.strokes.length).toBeGreaterThan(10);
		});
	});
});
