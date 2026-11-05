import { describe, expect, test } from '@jest/globals';
import { parseSettingsFromUrl } from 'src/components/formats/current/utils/parse-settings-from-url';

////////
////////

describe('parseSettingsFromUrl', () => {
	test('reports no explicit viewBox when the URL has no query', () => {
		const parsed = parseSettingsFromUrl('https://example.com/ink');
		expect(parsed.hasExplicitViewBox).toBe(false);
		expect(parsed.isPendingPaste).toBe(false);
	});

	test('reports no explicit viewBox when the query only has type and width', () => {
		const parsed = parseSettingsFromUrl('https://example.com/ink?type=inkDrawing&width=500&aspectRatio=1.000');
		expect(parsed.hasExplicitViewBox).toBe(false);
	});

	// #180: without viewBox params the preview must defer to the SVG file's own viewBox.
	test('reports an explicit viewBox for the current viewBoxW/viewBoxH params', () => {
		const parsed = parseSettingsFromUrl(
			'https://example.com/ink?type=inkDrawing&width=500&aspectRatio=1.333&viewBoxX=10&viewBoxY=20&viewBoxW=400&viewBoxH=300',
		);
		expect(parsed.hasExplicitViewBox).toBe(true);
		expect(parsed.embedSettings.viewBox).toEqual({ x: 10, y: 20, width: 400, height: 300 });
	});

	test('reports an explicit viewBox for legacy viewBoxWidth/viewBoxHeight params', () => {
		const parsed = parseSettingsFromUrl(
			'https://example.com/ink?type=inkDrawing&viewBoxWidth=400&viewBoxHeight=300',
		);
		expect(parsed.hasExplicitViewBox).toBe(true);
		expect(parsed.embedSettings.viewBox.width).toBe(400);
		expect(parsed.embedSettings.viewBox.height).toBe(300);
	});

	test('reports an explicit viewBox when only the size params are present', () => {
		const parsed = parseSettingsFromUrl('https://example.com/ink?type=inkDrawing&viewBoxW=120');
		expect(parsed.hasExplicitViewBox).toBe(true);
	});

	test('treats a viewBox origin without a size as not explicit', () => {
		const parsed = parseSettingsFromUrl('https://example.com/ink?type=inkDrawing&viewBoxX=10&viewBoxY=20');
		expect(parsed.hasExplicitViewBox).toBe(false);
	});

	test('still parses width and aspect ratio', () => {
		const parsed = parseSettingsFromUrl('https://example.com/ink?type=inkDrawing&width=700&aspectRatio=1.778');
		expect(parsed.embedSettings.embedDisplay.width).toBe(700);
		expect(parsed.embedSettings.embedDisplay.aspectRatio).toBeCloseTo(1.778, 3);
	});

	test('still detects pendingPaste', () => {
		const parsed = parseSettingsFromUrl('https://example.com/ink?type=inkWriting&pendingPaste=true');
		expect(parsed.isPendingPaste).toBe(true);
	});
});
