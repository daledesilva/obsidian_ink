import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, test } from '@jest/globals';
import { INK_CANVAS_FORMAT_VERSION } from 'src/constants';
import { isInkCanvasFile } from 'src/components/formats/current/utils/ink-file-storage-engine';
import { buildFileStr } from 'src/components/formats/current/utils/buildFileStr';
import { convertLegacyToInkCanvasFileData } from 'src/logic/utils/migration-logic';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';

const LEGACY_WRITING_FIXTURE = path.join(
	__dirname,
	'../../../qa-test-vault/fixtures/legacy-writing-fixture.writing',
);
const LEGACY_DRAWING_FIXTURE = path.join(
	__dirname,
	'../../../qa-test-vault/fixtures/legacy-drawing-fixture.drawing',
);

const WRITING_JSON = fs.readFileSync(LEGACY_WRITING_FIXTURE, 'utf8');
const DRAWING_JSON = fs.readFileSync(LEGACY_DRAWING_FIXTURE, 'utf8');

const BULK_CASES: Array<{ fileType: 'writing' | 'drawing'; legacyJson: string }> = [];
for (let i = 0; i < 25; i++) {
	BULK_CASES.push({ fileType: 'writing', legacyJson: WRITING_JSON });
	BULK_CASES.push({ fileType: 'drawing', legacyJson: DRAWING_JSON });
}

describe('v1 bulk migration to ink-canvas', () => {
	test.each(BULK_CASES.map((c, index) => [index, c.fileType, c.legacyJson] as const))(
		'converts v1 file %i (%s) to ink-canvas SVG',
		(_index, fileType, legacyJson) => {
			const fileData = convertLegacyToInkCanvasFileData(legacyJson, fileType);
			expect(fileData).not.toBeNull();
			expect(fileData!.meta.previewIsOutdated).toBeUndefined();

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
			}
		},
	);

	test('runs exactly 50 conversions', () => {
		expect(BULK_CASES).toHaveLength(50);
	});
});
