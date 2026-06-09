import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, test } from '@jest/globals';
import { buildFileStr } from 'src/components/formats/current/utils/buildFileStr';
import { isInkCanvasFile } from 'src/components/formats/current/utils/ink-file-storage-engine';
import { INK_CANVAS_FORMAT_VERSION, INK_EMBED_BASE_URL } from 'src/constants';
import { DEFAULT_STROKE_STYLE } from 'src/ink-canvas/types';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { buildDrawingEmbedSettingsFromStrokes } from 'src/logic/utils/build-drawing-embed-settings-from-file';
import {
	convertTldrawInkFileDataToInkCanvas,
	findV2InkEmbedRefs,
	replaceV2DrawingEmbedLinesInMarkdown,
} from 'src/logic/utils/tldraw-svg-migration-logic';
import { DEFAULT_EMBED_SETTINGS } from 'src/types/embed-settings';

const FIXTURES_DIR = path.join(__dirname, '../../../qa-test-vault/fixtures');
const DRAWING_FIXTURE = path.join(FIXTURES_DIR, 'v2-tldraw-drawing-tasks-priority.svg');
const WRITING_FIXTURE = path.join(FIXTURES_DIR, 'v2-tldraw-writing-llm-text.svg');

describe('findV2InkEmbedRefs', () => {
	test('finds writing and drawing embed paths', () => {
		const md = `
# Note
 ![InkWriting](<Ink/Writing/note.svg>) [Edit Writing](${INK_EMBED_BASE_URL}?type=inkWriting)
 ![InkDrawing](<Ink/Drawing/sketch.svg>) [Edit Drawing](${INK_EMBED_BASE_URL}?type=inkDrawing&width=500)
`;
		const refs = findV2InkEmbedRefs(md);
		expect(refs).toHaveLength(2);
		expect(refs[0]).toEqual({ filepath: 'Ink/Writing/note.svg', embedKind: 'writing' });
		expect(refs[1]).toEqual({ filepath: 'Ink/Drawing/sketch.svg', embedKind: 'drawing' });
	});
});

describe('convertTldrawInkFileDataToInkCanvas', () => {
	test('converts drawing fixture to ink-canvas without camera', () => {
		const svg = fs.readFileSync(DRAWING_FIXTURE, 'utf8');
		const data = extractInkJsonFromSvg(svg);
		expect(data).not.toBeNull();
		expect(isInkCanvasFile(data!)).toBe(false);

		const converted = convertTldrawInkFileDataToInkCanvas(data!);
		expect(converted).not.toBeNull();
		expect(converted!.inkCanvas!.camera).toBeUndefined();
		expect(converted!.inkCanvas!.strokes.length).toBeGreaterThan(0);
		for (const stroke of converted!.inkCanvas!.strokes) {
			expect(stroke.style.color).toBe('currentColor');
		}

		const out = buildFileStr(converted!);
		expect(out).toContain(`<ink-canvas version="${INK_CANVAS_FORMAT_VERSION}">`);
		expect(out).not.toContain('<tldraw version="2.1.0">');
		expect(out).toContain('fill="#000000"');
		expect(out).toContain('class="ink-type-stroke ink-color-primary"');
	});

	test('converts writing fixture to ink-canvas', () => {
		const svg = fs.readFileSync(WRITING_FIXTURE, 'utf8');
		const data = extractInkJsonFromSvg(svg)!;
		const converted = convertTldrawInkFileDataToInkCanvas(data);
		expect(converted).not.toBeNull();
		expect(converted!.meta.fileType).toBe('inkWriting');
		expect(converted!.inkCanvas!.strokes.length).toBeGreaterThan(0);
	});

	test('returns null for already ink-canvas data', () => {
		const svg = fs.readFileSync(DRAWING_FIXTURE, 'utf8');
		const data = extractInkJsonFromSvg(svg)!;
		const converted = convertTldrawInkFileDataToInkCanvas(data)!;
		expect(convertTldrawInkFileDataToInkCanvas(converted)).toBeNull();
	});

	test('drawing fixture yields fitted embed settings', () => {
		const svg = fs.readFileSync(DRAWING_FIXTURE, 'utf8');
		const data = extractInkJsonFromSvg(svg)!;
		const converted = convertTldrawInkFileDataToInkCanvas(data)!;
		const embedSettings = buildDrawingEmbedSettingsFromStrokes(converted.inkCanvas!.strokes);
		expect(embedSettings).not.toBeNull();
		expect(embedSettings!.viewBox).not.toEqual(DEFAULT_EMBED_SETTINGS.viewBox);
	});
});

describe('replaceV2DrawingEmbedLinesInMarkdown', () => {
	test('updates viewBox params on drawing embed line', () => {
		const svgPath = 'Ink/Drawing/bulk-tldraw-drawing.svg';
		const md = `\n ![InkDrawing](<${svgPath}>) [Edit Drawing](${INK_EMBED_BASE_URL}?type=inkDrawing&width=500&aspectRatio=1.778&viewBoxX=0&viewBoxY=0&viewBoxW=500&viewBoxH=281)\n`;
		const fitted = buildDrawingEmbedSettingsFromStrokes([
			{
				id: 's1',
				points: [
					[200, 300, 0.5],
					[400, 500, 0.5],
				],
				style: { ...DEFAULT_STROKE_STYLE },
				offset: { x: 0, y: 0 },
			},
		])!;

		const updated = replaceV2DrawingEmbedLinesInMarkdown(md, svgPath, fitted);
		expect(updated).not.toContain('viewBoxX=0');
		expect(updated).toContain('viewBoxX=');
		expect(updated).toContain('width=500');
	});
});
