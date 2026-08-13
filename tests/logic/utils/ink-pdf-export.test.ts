import {
	allowNativeInkPdfPreviewsForNextExport,
	getInkPdfPreviewPath,
	getInkSourcePathFromEmbedPath,
	isInkPdfPreviewPath,
	shouldUseNativeInkPdfPreviews,
} from 'src/logic/utils/ink-pdf-export';

describe('Ink PDF export paths', () => {
	it('maps editable SVGs to same-basename PNG companions', () => {
		expect(getInkPdfPreviewPath('Ink/Writing/page.svg')).toBe('Ink/Writing/page.png');
	});

	it('maps PDF preview markers back to editable SVGs', () => {
		expect(getInkSourcePathFromEmbedPath('Ink/Drawing/sketch.png')).toBe('Ink/Drawing/sketch.svg');
		expect(getInkSourcePathFromEmbedPath('Ink/Drawing/sketch.svg')).toBe('Ink/Drawing/sketch.svg');
	});

	it('identifies only PNG companion paths', () => {
		expect(isInkPdfPreviewPath('Ink/Writing/page.PNG')).toBe(true);
		expect(isInkPdfPreviewPath('Ink/Writing/page.svg')).toBe(false);
	});

	it('temporarily lets the PDF exporter use native PNG markers', () => {
		allowNativeInkPdfPreviewsForNextExport(1000);
		expect(shouldUseNativeInkPdfPreviews()).toBe(true);
	});
});
