import { describe, expect, test } from "@jest/globals";
import { buildFileStr, type InkFileData } from './buildFileStr';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';
import { DEFAULT_TLEDITOR_DRAWING_SNAPSHOT } from 'src/defaults/default-tleditor-drawing-snapshot';

describe('buildFileStr', () => {
	const mockTLEditorSnapshot = DEFAULT_TLEDITOR_DRAWING_SNAPSHOT;

	const createMockInkFileData = (overrides: Partial<InkFileData> = {}): InkFileData => ({
		meta: {
			pluginVersion: PLUGIN_VERSION,
			tldrawVersion: TLDRAW_VERSION,
		},
		tldraw: mockTLEditorSnapshot,
		...overrides
	});

	test('should create SVG with metadata when previewUri is provided', () => {
		const pageData = createMockInkFileData({
			previewUri: '<svg><rect width="100" height="100"/></svg>'
		});

		const result = buildFileStr(pageData);

		expect(result).toContain('<svg>');
		expect(result).toContain('<metadata>');
		expect(result).toContain('<inkdrawing version="1">');
		expect(result).toContain('"pluginVersion"');
		expect(result).toContain('"tldrawVersion"');
		expect(result).toContain('<rect width="100" height="100"/>');
	});

	test('should create SVG with default empty SVG when previewUri is not provided', () => {
		const pageData = createMockInkFileData();

		const result = buildFileStr(pageData);

		expect(result).toContain('<svg>');
		expect(result).toContain('<metadata>');
		expect(result).toContain('<inkdrawing version="1">');
		expect(result).toContain('"pluginVersion"');
		expect(result).toContain('"tldrawVersion"');
	});

	test('should exclude previewUri from the JSON metadata', () => {
		const pageData = createMockInkFileData({
			previewUri: '<svg><circle cx="50" cy="50" r="25"/></svg>'
		});

		const result = buildFileStr(pageData);

		expect(result).toContain('<circle cx="50" cy="50" r="25"/>');
		expect(result).not.toContain('"previewUri"');
	});

	test('should include optional metadata fields when present', () => {
		const pageData = createMockInkFileData({
			meta: {
				pluginVersion: PLUGIN_VERSION,
				tldrawVersion: TLDRAW_VERSION,
				previewIsOutdated: true,
				transcript: 'Sample transcript text'
			}
		});

		const result = buildFileStr(pageData);

		expect(result).toContain('"previewIsOutdated": true');
		expect(result).toContain('"transcript": "Sample transcript text"');
	});

	test('should format the output with proper indentation', () => {
		const pageData = createMockInkFileData();

		const result = buildFileStr(pageData);

		// Check that the output is properly formatted with tabs
		const lines = result.split('\n');
		expect(lines.length).toBeGreaterThan(1);
		
		// Check that metadata element is properly indented
		const metadataLine = lines.find(line => line.includes('<metadata>'));
		expect(metadataLine).toBeDefined();
		expect(metadataLine?.startsWith('\t')).toBe(true);
	});

	test('should handle complex SVG content', () => {
		const complexSvg = `
			<svg width="200" height="200">
				<defs>
					<linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
						<stop offset="0%" style="stop-color:rgb(255,255,0);stop-opacity:1" />
						<stop offset="100%" style="stop-color:rgb(255,0,0);stop-opacity:1" />
					</linearGradient>
				</defs>
				<rect width="200" height="200" fill="url(#grad1)" />
				<text x="100" y="100" text-anchor="middle" fill="white">Hello World</text>
			</svg>
		`;
		
		const pageData = createMockInkFileData({
			previewUri: complexSvg
		});

		const result = buildFileStr(pageData);

		expect(result).toContain('<svg width="200" height="200">');
		expect(result).toContain('<defs>');
		expect(result).toContain('<linearGradient id="grad1"');
		expect(result).toContain('<rect width="200" height="200"');
		expect(result).toContain('<text x="100" y="100"');
		expect(result).toContain('Hello World');
	});
}); 