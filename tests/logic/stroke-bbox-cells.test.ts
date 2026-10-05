import { describe, expect, test } from '@jest/globals';
import {
	clampAutoTranscribeChangeThresholdPercent,
	inkChangeMeetsAutoTranscribeThreshold,
	serializeBboxCellsAtLastTranscription,
} from 'src/logic/stroke-bbox-cells';
import { InkFileData } from 'src/components/formats/current/types/file-data';
import { PLUGIN_VERSION } from 'src/constants';
import { DEFAULT_STROKE_STYLE, type InkCanvasSnapshot, type InkStroke } from 'src/ink-canvas/types';

function makeInkCanvasPageData(strokes: InkStroke[]): InkFileData {
	const inkCanvas: InkCanvasSnapshot = {
		version: 1,
		strokes,
		gridEnabled: false,
	};
	return {
		meta: {
			pluginVersion: PLUGIN_VERSION,
			tldrawVersion: '',
			fileType: 'inkWriting',
		},
		tldraw: {} as InkFileData['tldraw'],
		inkCanvas,
		svgString: '<svg/>',
	};
}

function makeStroke(id: string, points: Array<[number, number, number]>): InkStroke {
	return {
		id,
		points,
		style: { ...DEFAULT_STROKE_STYLE },
		offset: { x: 0, y: 0 },
	};
}

describe('inkChangeMeetsAutoTranscribeThreshold', () => {
	test('returns true when no stored bbox cells (never transcribed)', () => {
		const pageData = makeInkCanvasPageData([
			makeStroke('s1', [[0, 0, 0.5], [10, 0, 0.5]]),
		]);
		expect(inkChangeMeetsAutoTranscribeThreshold(1, undefined, pageData)).toBe(true);
	});

	test('returns true at 0% threshold even when occupancy is unchanged', () => {
		const pageData = makeInkCanvasPageData([
			makeStroke('s1', [[0, 0, 0.5], [10, 0, 0.5]]),
		]);
		const stored = serializeBboxCellsAtLastTranscription(pageData);
		expect(inkChangeMeetsAutoTranscribeThreshold(0, stored, pageData)).toBe(true);
	});

	test('returns false at 1% when bbox occupancy is unchanged', () => {
		const pageData = makeInkCanvasPageData([
			makeStroke('s1', [[0, 0, 0.5], [10, 0, 0.5]]),
		]);
		const stored = serializeBboxCellsAtLastTranscription(pageData);
		expect(inkChangeMeetsAutoTranscribeThreshold(1, stored, pageData)).toBe(false);
	});

	test('returns true at 50% when added strokes occupy many new cells', () => {
		const baseline = makeInkCanvasPageData([
			makeStroke('s1', [[0, 0, 0.5], [10, 0, 0.5]]),
		]);
		const edited = makeInkCanvasPageData([
			makeStroke('s1', [[0, 0, 0.5], [10, 0, 0.5]]),
			makeStroke('s2', [[400, 400, 0.5], [450, 420, 0.5]]),
		]);
		const stored = serializeBboxCellsAtLastTranscription(baseline);
		expect(inkChangeMeetsAutoTranscribeThreshold(50, stored, edited)).toBe(true);
		expect(inkChangeMeetsAutoTranscribeThreshold(50, stored, baseline)).toBe(false);
	});

	test('treats a translated copy as unchanged occupancy (bbox origin)', () => {
		const original = makeInkCanvasPageData([
			makeStroke('s1', [[0, 0, 0.5], [40, 0, 0.5], [40, 40, 0.5]]),
		]);
		const translated = makeInkCanvasPageData([
			makeStroke('s1', [[64, 64, 0.5], [104, 64, 0.5], [104, 104, 0.5]]),
		]);
		const stored = serializeBboxCellsAtLastTranscription(original);
		expect(serializeBboxCellsAtLastTranscription(translated)).toBe(stored);
		expect(inkChangeMeetsAutoTranscribeThreshold(1, stored, translated)).toBe(false);
	});

	test('clamps invalid threshold values', () => {
		expect(clampAutoTranscribeChangeThresholdPercent(NaN)).toBe(1);
		expect(clampAutoTranscribeChangeThresholdPercent(-5)).toBe(0);
		expect(clampAutoTranscribeChangeThresholdPercent(200)).toBe(95);
	});
});
