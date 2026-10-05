import { DOMParser as XmlDomParser } from '@xmldom/xmldom';
import { Canvg } from 'canvg';

//////////
//////////

export type WritingSvgCreateCanvas = () => HTMLCanvasElement;

export type WritingSvgPageTheme = 'light' | 'dark';

/** Best-effort dimensions from viewBox or width/height attributes. */
export function parseWritingSvgDimensions(svgString: string): { width: number; height: number } {
	const viewBox = parseWritingSvgViewBox(svgString);
	if (viewBox) return { width: viewBox.width, height: viewBox.height };
	const widthMatch = svgString.match(/\bwidth\s*=\s*["']([\d.]+)/i);
	const heightMatch = svgString.match(/\bheight\s*=\s*["']([\d.]+)/i);
	const width = widthMatch ? Number.parseFloat(widthMatch[1]) : 500;
	const height = heightMatch ? Number.parseFloat(heightMatch[1]) : 500;
	if (width > 0 && height > 0) return { width, height };
	return { width: 500, height: 500 };
}

export function parseWritingSvgViewBox(
	svgString: string,
): { x: number; y: number; width: number; height: number } | null {
	const viewBoxMatch = svgString.match(/viewBox\s*=\s*["']([^"']+)["']/i);
	if (!viewBoxMatch) return null;
	const parts = viewBoxMatch[1].split(/[\s,]+/).map((part) => Number.parseFloat(part));
	if (parts.length !== 4 || !parts.every((n) => Number.isFinite(n))) return null;
	if (parts[2] <= 0 || parts[3] <= 0) return null;
	return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

/**
 * Ink files bake stroke colour into `ink-color-primary` fills. Dark ink means a
 * light page; light ink means a dark page. Default light — Ink exports `#000000`.
 */
export function resolveWritingSvgPageTheme(svgString: string): WritingSvgPageTheme {
	const fills: string[] = [];
	const pathTagPattern = /<path\b[^>]*>/gi;
	let tagMatch: RegExpExecArray | null;
	while ((tagMatch = pathTagPattern.exec(svgString)) !== null) {
		const tag = tagMatch[0];
		if (!/\bink-color-primary\b/.test(tag)) continue;
		const fillMatch = tag.match(/\bfill\s*=\s*["']([^"']+)["']/i);
		if (fillMatch) fills.push(fillMatch[1]);
		if (fills.length >= 12) break;
	}

	if (fills.length === 0) return 'light';

	let luminanceSum = 0;
	let parsedCount = 0;
	for (const fill of fills) {
		const rgb = parseCssColorToRgb(fill);
		if (!rgb) continue;
		luminanceSum += (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
		parsedCount += 1;
	}
	if (parsedCount === 0) return 'light';
	return luminanceSum / parsedCount >= 0.5 ? 'dark' : 'light';
}

export function transcriptionBackgroundForTheme(theme: WritingSvgPageTheme): '#ffffff' | '#000000' {
	return theme === 'dark' ? '#000000' : '#ffffff';
}

/** Inserts an opaque page rect so Canvg cannot leave a transparent canvas. */
export function bakeOpaqueWritingBackground(svgString: string, background: string): string {
	const viewBox = parseWritingSvgViewBox(svgString);
	const { width, height } = parseWritingSvgDimensions(svgString);
	const x = viewBox?.x ?? 0;
	const y = viewBox?.y ?? 0;
	const rect = `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${background}"/>`;
	return svgString.replace(/<svg\b[^>]*>/i, (openTag) => `${openTag}${rect}`);
}

function parseCssColorToRgb(color: string): { r: number; g: number; b: number } | null {
	const normalized = color.trim().toLowerCase();
	if (normalized === 'black') return { r: 0, g: 0, b: 0 };
	if (normalized === 'white') return { r: 255, g: 255, b: 255 };
	const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
	if (!hex) return null;
	const value = hex[1];
	if (value.length === 3) {
		return {
			r: Number.parseInt(value[0] + value[0], 16),
			g: Number.parseInt(value[1] + value[1], 16),
			b: Number.parseInt(value[2] + value[2], 16),
		};
	}
	return {
		r: Number.parseInt(value.slice(0, 2), 16),
		g: Number.parseInt(value.slice(2, 4), 16),
		b: Number.parseInt(value.slice(4, 6), 16),
	};
}

function scaleDimensionsForTranscription(width: number, height: number): { width: number; height: number } {
	let w = width;
	let h = height;
	if (w > 1500 || h > 2000) {
		while (w > 1500) {
			w /= 2;
			h /= 2;
		}
	} else if (w < 500) {
		while (w < 500) {
			w *= 2;
			h *= 2;
		}
	}
	return { width: w, height: h };
}

function defaultCreateCanvas(): HTMLCanvasElement {
	if (typeof createEl === 'function') {
		return createEl('canvas');
	}
	if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
		return document.createElement('canvas');
	}
	throw new Error('No DOM canvas available; pass createCanvas for Node rasterization');
}

/**
 * Renders a visual writing SVG to an opaque PNG (no data-URI prefix).
 * Page colour follows ink luminance: dark strokes → white, light strokes → black.
 */
export async function writingSvgToPngBase64(
	visualSvg: string,
	options?: { createCanvas?: WritingSvgCreateCanvas },
): Promise<string | null> {
	try {
		const createCanvas = options?.createCanvas ?? defaultCreateCanvas;
		const parsed = parseWritingSvgDimensions(visualSvg);
		const { width, height } = scaleDimensionsForTranscription(parsed.width, parsed.height);
		const pageTheme = resolveWritingSvgPageTheme(visualSvg);
		const background = transcriptionBackgroundForTheme(pageTheme);
		const svgWithPage = bakeOpaqueWritingBackground(visualSvg, background);

		const canvas = createCanvas();
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;

		ctx.fillStyle = background;
		ctx.fillRect(0, 0, width, height);

		// Node has no window.DOMParser; @xmldom matches the plugin's SVG stack.
		const canvgOptions = {
			ignoreAnimation: true,
			ignoreMouse: true,
			...(typeof DOMParser === 'undefined' ? { DOMParser: XmlDomParser } : {}),
		};
		const canvgRenderer = await Canvg.from(ctx, svgWithPage, canvgOptions);
		canvgRenderer.resize(width, height, 'xMidYMid meet');
		// One-shot render — start() needs requestAnimationFrame, which Node does not have.
		await canvgRenderer.render();

		const dataUrl = canvas.toDataURL('image/png');
		canvgRenderer.stop();
		if (typeof canvas.remove === 'function') {
			canvas.remove();
		}

		const commaIndex = dataUrl.indexOf(',');
		if (commaIndex === -1) return null;
		return dataUrl.slice(commaIndex + 1);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to rasterize writing SVG to PNG: ${message}`);
	}
}
