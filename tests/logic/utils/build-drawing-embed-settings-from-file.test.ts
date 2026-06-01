import { describe, expect, test } from '@jest/globals';
import { PLUGIN_VERSION } from 'src/constants';
import {
	buildDrawingEmbedSettingsFromFile,
	buildDrawingEmbedSettingsFromStrokes,
} from 'src/logic/utils/build-drawing-embed-settings-from-file';
import { DEFAULT_EMBED_SETTINGS } from 'src/types/embed-settings';
import { DEFAULT_STROKE_STYLE } from 'src/ink-canvas/types';
import type InkPlugin from 'src/main';
import type { TFile } from 'obsidian';

function makeInkCanvasDrawingSvg(strokes: object[]): string {
	const inkCanvasJson = JSON.stringify({
		version: 1,
		strokes,
		gridEnabled: false,
	});
	return `<svg xmlns="http://www.w3.org/2000/svg">
		<metadata>
			<ink plugin-version="${PLUGIN_VERSION}" file-type="inkDrawing"/>
			<ink-canvas version="0.5.0">${inkCanvasJson}</ink-canvas>
		</metadata>
	</svg>`;
}

function makePlugin(readResult: string): InkPlugin {
	return {
		app: {
			vault: {
				read: jest.fn().mockResolvedValue(readResult),
			},
		},
	} as unknown as InkPlugin;
}

function makeFile(): TFile {
	return { path: 'Ink/Drawing/test.svg' } as TFile;
}

describe('buildDrawingEmbedSettingsFromStrokes', () => {
	test('returns null when there are no strokes', () => {
		expect(buildDrawingEmbedSettingsFromStrokes([])).toBeNull();
	});

	test('returns fitted viewBox when strokes are present', () => {
		const settings = buildDrawingEmbedSettingsFromStrokes([
			{
				id: 's1',
				points: [
					[10, 10, 0.5],
					[100, 80, 0.5],
				],
				style: { ...DEFAULT_STROKE_STYLE },
				offset: { x: 0, y: 0 },
			},
		]);
		expect(settings).not.toBeNull();
		expect(settings!.viewBox.x).toBeLessThan(10);
		expect(settings!.viewBox.y).toBeLessThan(10);
		expect(settings!.viewBox.x + settings!.viewBox.width).toBeGreaterThan(100);
		expect(settings!.viewBox.y + settings!.viewBox.height).toBeGreaterThan(80);
	});
});

describe('buildDrawingEmbedSettingsFromFile', () => {
	test('returns default settings when file has no strokes', async () => {
		const emptySvg = makeInkCanvasDrawingSvg([]);
		const settings = await buildDrawingEmbedSettingsFromFile(makePlugin(emptySvg), makeFile());
		expect(settings.viewBox).toEqual(DEFAULT_EMBED_SETTINGS.viewBox);
	});

	test('returns fitted viewBox when strokes are present', async () => {
		const svg = makeInkCanvasDrawingSvg([
			{
				id: 's1',
				points: [
					[10, 10, 0.5],
					[100, 80, 0.5],
				],
				style: { ...DEFAULT_STROKE_STYLE },
				offset: { x: 0, y: 0 },
			},
		]);
		const settings = await buildDrawingEmbedSettingsFromFile(makePlugin(svg), makeFile());
		// Small strokes in the default 500×281 viewport often keep width 500 (zoom capped at 1);
		// the fit is visible via pan (viewBox origin) enclosing the strokes.
		expect(settings.viewBox.x).not.toBe(DEFAULT_EMBED_SETTINGS.viewBox.x);
		expect(settings.viewBox.y).not.toBe(DEFAULT_EMBED_SETTINGS.viewBox.y);
		expect(settings.viewBox.x).toBeLessThan(10);
		expect(settings.viewBox.y).toBeLessThan(10);
		expect(settings.viewBox.x + settings.viewBox.width).toBeGreaterThan(100);
		expect(settings.viewBox.y + settings.viewBox.height).toBeGreaterThan(80);
	});
});
