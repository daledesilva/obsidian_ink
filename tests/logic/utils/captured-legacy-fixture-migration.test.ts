import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, test } from '@jest/globals';
import { buildFileStr } from 'src/components/formats/current/utils/buildFileStr';
import { isInkCanvasFile } from 'src/components/formats/current/utils/ink-file-storage-engine';
import { INK_CANVAS_FORMAT_VERSION } from 'src/constants';
import { convertLegacyToInkCanvasFileData } from 'src/logic/utils/migration-logic';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { DEFAULT_STROKE_STYLE } from 'src/ink-canvas/types';

const FIXTURES_DIR = path.join(__dirname, '../../../qa-test-vault/fixtures');

/** Real .writing / .drawing captures moved from the ink-suite repo root. */
export const CAPTURED_LEGACY_FIXTURES = [
	{
		fileType: 'writing' as const,
		fixtureFile: 'captured-legacy-writing-2024-07-22-2152.writing',
	},
	{
		fileType: 'writing' as const,
		fixtureFile: 'captured-legacy-writing-2024-07-22-2202.writing',
	},
	{
		fileType: 'writing' as const,
		fixtureFile: 'captured-legacy-writing-2024-07-22-2348.writing',
	},
	{
		fileType: 'writing' as const,
		fixtureFile: 'captured-legacy-writing-2024-08-06-2302.writing',
	},
	{
		fileType: 'drawing' as const,
		fixtureFile: 'captured-legacy-drawing-2025-03-16-1327.drawing',
	},
	{
		fileType: 'drawing' as const,
		fixtureFile: 'captured-legacy-drawing-2025-03-16-1330.drawing',
	},
] as const;

function readFixture(fixtureFile: string): string {
	return fs.readFileSync(path.join(FIXTURES_DIR, fixtureFile), 'utf8');
}

describe('captured legacy fixture migration to ink-canvas', () => {
	test.each(CAPTURED_LEGACY_FIXTURES.map((fixture) => [fixture.fixtureFile, fixture.fileType] as const))(
		'converts %s (%s) to ink-canvas SVG',
		(fixtureFile, fileType) => {
			const legacyJson = readFixture(fixtureFile);
			const fileData = convertLegacyToInkCanvasFileData(legacyJson, fileType);
			expect(fileData).not.toBeNull();
			expect(fileData!.meta.previewIsOutdated).toBeUndefined();
			expect(fileData!.meta.fileType).toBe(fileType === 'writing' ? 'inkWriting' : 'inkDrawing');

			const svgStr = buildFileStr(fileData!);
			expect(svgStr).toContain(`<ink-canvas version="${INK_CANVAS_FORMAT_VERSION}">`);
			expect(svgStr).not.toContain('<tldraw version=');

			const parsed = extractInkJsonFromSvg(svgStr);
			expect(parsed).not.toBeNull();
			expect(isInkCanvasFile(parsed!)).toBe(true);
			expect(parsed!.inkCanvas!.strokes.length).toBeGreaterThan(0);

			expect(svgStr).toContain('fill="#000000"');
			expect(svgStr).toContain('class="ink-type-stroke ink-color-primary"');
			for (const stroke of parsed!.inkCanvas!.strokes) {
				expect(stroke.style.color).toBe('currentColor');
				expect(stroke.style.streamline).toBe(DEFAULT_STROKE_STYLE.streamline);
				expect(stroke.style.smoothing).toBe(DEFAULT_STROKE_STYLE.smoothing);
			}

			if (fileType === 'writing') {
				expect(svgStr).toContain('stroke="#888888"');
				expect(svgStr).toContain('class="ink-type-writing-line ink-color-writing-line"');
			}
		},
	);
});
