import { Canvg } from 'canvg';

//////////
//////////

export type WritingSvgCreateCanvas = () => HTMLCanvasElement;

/** Best-effort dimensions from viewBox or width/height attributes. */
export function parseWritingSvgDimensions(svgString: string): { width: number; height: number } {
	const viewBoxMatch = svgString.match(/viewBox\s*=\s*["']([^"']+)["']/i);
	if (viewBoxMatch) {
		const parts = viewBoxMatch[1].split(/[\s,]+/).map((part) => Number.parseFloat(part));
		if (parts.length === 4 && parts.every((n) => Number.isFinite(n) && n > 0)) {
			return { width: parts[2], height: parts[3] };
		}
	}
	const widthMatch = svgString.match(/\bwidth\s*=\s*["']([\d.]+)/i);
	const heightMatch = svgString.match(/\bheight\s*=\s*["']([\d.]+)/i);
	const width = widthMatch ? Number.parseFloat(widthMatch[1]) : 500;
	const height = heightMatch ? Number.parseFloat(heightMatch[1]) : 500;
	if (width > 0 && height > 0) return { width, height };
	return { width: 500, height: 500 };
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

/**
 * Renders a visual writing SVG to opaque-white PNG base64 (no data-URI prefix).
 * Injectable canvas factory keeps Jest off Obsidian DOM APIs.
 */
export async function writingSvgToPngBase64(
	visualSvg: string,
	options?: { createCanvas?: WritingSvgCreateCanvas },
): Promise<string | null> {
	try {
		const createCanvas = options?.createCanvas ?? (() => createEl('canvas'));
		const parsed = parseWritingSvgDimensions(visualSvg);
		const { width, height } = scaleDimensionsForTranscription(parsed.width, parsed.height);

		const canvas = createCanvas();
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;

		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, width, height);

		const canvgRenderer = await Canvg.from(ctx, visualSvg);
		canvgRenderer.resize(width, height, 'xMidYMid meet');
		canvgRenderer.start();

		const dataUrl = canvas.toDataURL('image/png');
		canvgRenderer.stop();
		canvas.remove();

		const commaIndex = dataUrl.indexOf(',');
		if (commaIndex === -1) return null;
		return dataUrl.slice(commaIndex + 1);
	} catch {
		return null;
	}
}
