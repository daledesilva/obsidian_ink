import {
	DRAWING_EMBED_PREVIEW_CLASS,
	embedPreviewClassForFileType,
	mountInlineSvgPreview,
	WRITING_EMBED_PREVIEW_CLASS,
} from 'src/logic/utils/inline-svg-preview';

describe('inline-svg-preview', () => {
	describe('embedPreviewClassForFileType', () => {
		it('returns writing class for inkWriting', () => {
			expect(embedPreviewClassForFileType('inkWriting')).toBe(WRITING_EMBED_PREVIEW_CLASS);
		});

		it('returns drawing class for inkDrawing', () => {
			expect(embedPreviewClassForFileType('inkDrawing')).toBe(DRAWING_EMBED_PREVIEW_CLASS);
		});
	});

	describe('mountInlineSvgPreview', () => {
		it('appends an svg element to the host', () => {
			const host = document.createElement('div');
			const ok = mountInlineSvgPreview(
				host,
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0"/></svg>',
			);
			expect(ok).toBe(true);
			expect(host.querySelector('svg')).not.toBeNull();
			expect(host.querySelector('path')).not.toBeNull();
		});

		it('returns false for invalid markup', () => {
			const host = document.createElement('div');
			expect(mountInlineSvgPreview(host, 'not svg')).toBe(false);
			expect(host.children.length).toBe(0);
		});
	});
});
