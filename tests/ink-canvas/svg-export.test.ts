import { describe, expect, test } from '@jest/globals';
import {
	DEFAULT_CONTENT_COLOUR_PRIMARY_STROKE,
	DEFAULT_CONTENT_COLOUR_WRITING_LINE,
	INK_SVG_STROKE_PATH_CLASS,
	INK_SVG_WRITING_LINE_CLASS,
} from 'src/default-content-colours';
import { renderStrokesToSvg, renderWritingStrokesToSvg } from 'src/ink-canvas/svg-export';
import type { InkCanvasSnapshot, InkStroke } from 'src/ink-canvas/types';
import { DEFAULT_STROKE_STYLE } from 'src/ink-canvas/types';
import { WRITING_PAGE_WIDTH } from 'src/constants';

const emptySnapshot: InkCanvasSnapshot = {
	version: 1,
	strokes: [],
	gridEnabled: false,
};

const sampleStroke: InkStroke = {
	id: 'stroke-1',
	points: [
		[0, 0, 0.5],
		[20, 10, 0.6],
		[40, 5, 0.5],
	],
	style: { ...DEFAULT_STROKE_STYLE },
	offset: { x: 0, y: 0 },
};

describe('svg-export', () => {
	test('default-content-colours exports expected hex values', () => {
		expect(DEFAULT_CONTENT_COLOUR_PRIMARY_STROKE).toBe('#000000');
		expect(DEFAULT_CONTENT_COLOUR_WRITING_LINE).toBe('#888888');
		expect(INK_SVG_STROKE_PATH_CLASS).toBe('ink-type-stroke ink-color-primary');
		expect(INK_SVG_WRITING_LINE_CLASS).toBe('ink-type-writing-line ink-color-writing-line');
	});

	test('renderStrokesToSvg bakes primary stroke fill and classes', () => {
		const svg = renderStrokesToSvg([sampleStroke], emptySnapshot);
		expect(svg).toContain(`fill="${DEFAULT_CONTENT_COLOUR_PRIMARY_STROKE}"`);
		expect(svg).toContain(`class="${INK_SVG_STROKE_PATH_CLASS}"`);
		expect(svg).not.toContain('fill="currentColor"');
	});

	test('renderStrokesToSvg wraps offset strokes in translate group', () => {
		const offsetStroke: InkStroke = {
			...sampleStroke,
			id: 'stroke-2',
			offset: { x: 10, y: 20 },
		};
		const svg = renderStrokesToSvg([offsetStroke], emptySnapshot);
		expect(svg).toContain('transform="translate(10,20)"');
		expect(svg).toContain(`class="${INK_SVG_STROKE_PATH_CLASS}"`);
	});

	test('renderWritingStrokesToSvg includes guide lines with baked gray and classes', () => {
		const svg = renderWritingStrokesToSvg([], emptySnapshot, WRITING_PAGE_WIDTH);
		expect(svg).toContain(`stroke="${DEFAULT_CONTENT_COLOUR_WRITING_LINE}"`);
		expect(svg).toContain(`class="${INK_SVG_WRITING_LINE_CLASS}"`);
		expect(svg).toContain('stroke-opacity="0.5"');
		expect(svg).not.toContain('stroke="currentColor"');
	});

	test('renderWritingStrokesToSvg includes stroke paths with baked fill', () => {
		const svg = renderWritingStrokesToSvg([sampleStroke], emptySnapshot, WRITING_PAGE_WIDTH);
		expect(svg).toContain(`fill="${DEFAULT_CONTENT_COLOUR_PRIMARY_STROKE}"`);
		expect(svg).toContain(`class="${INK_SVG_STROKE_PATH_CLASS}"`);
	});
});
