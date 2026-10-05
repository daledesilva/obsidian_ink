/** @jest-environment node */

import { readFileSync } from 'fs';
import { getHandwritingTranscriptionFixture } from '../../fixtures/handwriting-transcription/fixtures';
import { createNodeWritingSvgCanvas } from '../../helpers/node-writing-svg-canvas';
import { stripWritingSvgToVisualOnly } from 'src/logic/utils/strip-writing-svg-to-visual-only';
import {
	bakeOpaqueWritingBackground,
	resolveWritingSvgPageTheme,
	writingSvgToPngBase64,
} from 'src/logic/utils/writing-svg-to-png-base64';

describe('writingSvgToPngBase64', () => {
	it('treats black primary ink as a light page', () => {
		const svg = '<svg viewBox="0 0 10 10"><path class="ink-type-stroke ink-color-primary" fill="#000000" d="M0 0"/></svg>';
		expect(resolveWritingSvgPageTheme(svg)).toBe('light');
		expect(bakeOpaqueWritingBackground(svg, '#ffffff')).toContain('fill="#ffffff"');
	});

	it('treats white primary ink as a dark page', () => {
		const svg = '<svg viewBox="0 0 10 10"><path fill="#ffffff" class="ink-type-stroke ink-color-primary" d="M0 0"/></svg>';
		expect(resolveWritingSvgPageTheme(svg)).toBe('dark');
	});

	it('rasterizes a visual writing SVG to PNG base64 in Node', async () => {
		const fixture = getHandwritingTranscriptionFixture('short - single paragraph');
		const visualSvg = stripWritingSvgToVisualOnly(readFileSync(fixture.svgPath, 'utf8'));
		const pngBase64 = await writingSvgToPngBase64(visualSvg, {
			createCanvas: createNodeWritingSvgCanvas,
		});
		expect(pngBase64).toBeTruthy();
		expect(pngBase64!.length).toBeGreaterThan(100);
		expect(Buffer.from(pngBase64!, 'base64').subarray(0, 8)).toEqual(
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		);
	}, 60_000);
});
