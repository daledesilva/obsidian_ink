/**
 * Drops ink metadata blocks so vision jobs send rendered strokes only, not
 * embedded JSON or transcript text that would waste tokens without helping OCR.
 */
export function stripWritingSvgToVisualOnly(svgString: string): string {
	const metadataPattern = /<metadata\b[^>]*>[\s\S]*?<\/metadata>/gi;
	return svgString.replace(metadataPattern, '');
}
