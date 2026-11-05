import { parseSvgViewBoxAspectRatio } from 'src/logic/utils/writing-embed-aspect-ratio';

////////
////////

/** ViewBox rectangle in SVG user units. */
export interface SvgViewBoxRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Reads the `viewBox` rectangle from raw SVG markup.
 * Returns `null` when the markup has no usable four-number viewBox.
 */
export function parseSvgViewBoxRect(svgString: string): SvgViewBoxRect | null {
	const viewBoxMatch = svgString.match(/<svg\b[^>]*\bviewBox\s*=\s*["']([^"']+)["']/i);
	if (!viewBoxMatch) return null;

	const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
	if (parts.length < 4) return null;

	const [x, y, width, height] = parts;
	if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
	if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
	if (width <= 0 || height <= 0) return null;

	return { x, y, width, height };
}

/**
 * Chooses the viewBox a drawing preview should display.
 *
 * Why this exists: the SVG file's own viewBox is authoritative for where the ink sits. Embeds
 * normally repeat that viewBox in the Edit link URL so the preview can match it before the file
 * finishes loading. When the URL has no viewBox (older embeds, or a lost query), using the default
 * `0 0 500 281` shifts and crops the drawing relative to its real content — which is the
 * "render drifts" symptom in #180. In that case the file's own viewBox wins.
 *
 * `hasExplicitUrlViewBox` must reflect whether the URL carried viewBox *size* params, not whether
 * `urlViewBox` is non-null: callers pass a defaulted box that is indistinguishable from a real one.
 */
export function resolveDrawingPreviewViewBox(
	urlViewBox: SvgViewBoxRect | null,
	hasExplicitUrlViewBox: boolean,
	fileViewBox: SvgViewBoxRect | null,
): SvgViewBoxRect | null {
	if (hasExplicitUrlViewBox && urlViewBox) return urlViewBox;
	if (fileViewBox) return fileViewBox;
	return urlViewBox;
}

/**
 * True when the URL viewBox and the file viewBox describe the same rectangle.
 * Used to decide whether the stored embed params need healing.
 */
export function svgViewBoxesMatch(
	a: SvgViewBoxRect | null,
	b: SvgViewBoxRect | null,
	tolerance: number = 0.5,
): boolean {
	if (!a || !b) return false;
	return (
		Math.abs(a.x - b.x) <= tolerance
		&& Math.abs(a.y - b.y) <= tolerance
		&& Math.abs(a.width - b.width) <= tolerance
		&& Math.abs(a.height - b.height) <= tolerance
	);
}

/** Aspect ratio (width ÷ height) of a viewBox, or `null` when unusable. */
export function viewBoxAspectRatio(viewBox: SvgViewBoxRect | null): number | null {
	if (!viewBox) return null;
	if (viewBox.width <= 0 || viewBox.height <= 0) return null;
	return viewBox.width / viewBox.height;
}

export { parseSvgViewBoxAspectRatio };
