////////
////////

/** Host class used for theme-aware writing previews. */
export const WRITING_EMBED_PREVIEW_CLASS = 'ddc_ink_writing-embed-preview';

/** Host class used for theme-aware drawing previews. */
export const DRAWING_EMBED_PREVIEW_CLASS = 'ddc_ink_drawing-embed-preview';

export function embedPreviewClassForFileType(
	fileType: 'inkWriting' | 'inkDrawing',
): string {
	return fileType === 'inkWriting' ? WRITING_EMBED_PREVIEW_CLASS : DRAWING_EMBED_PREVIEW_CLASS;
}

/**
 * Parse an SVG string and append the root element into `host` for CSS theme overrides.
 * Returns true when an svg element was mounted.
 */
export function mountInlineSvgPreview(host: HTMLElement, svgString: string): boolean {
	host.replaceChildren();

	const trimmed = svgString.trim();
	if (!trimmed.startsWith('<')) return false;

	const doc = new DOMParser().parseFromString(trimmed, 'image/svg+xml');
	const parseError = doc.querySelector('parsererror');
	if (parseError) return false;

	const svg = doc.documentElement;
	if (svg.tagName.toLowerCase() !== 'svg') return false;

	svg.setAttribute('width', '100%');
	svg.setAttribute('height', '100%');
	svg.style.maxWidth = '100%';
	svg.style.maxHeight = '100%';
	svg.style.display = 'block';

	host.appendChild(host.ownerDocument.importNode(svg, true));
	return true;
}
