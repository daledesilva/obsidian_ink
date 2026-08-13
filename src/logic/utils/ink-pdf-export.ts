import { normalizePath, TFile } from 'obsidian';
import type InkPlugin from 'src/main';
import { getPreviewFileVaultPath } from './getPreviewFileVaultPath';
import { savePngExport } from './savePngExport';
import { svgToPngDataUri } from './screenshots';

const PDF_PREVIEW_REFRESH_DELAY_MS = 1200;
let nativePdfPreviewUntil = 0;

type PendingPreviewRefresh = {
	timer: number;
	plugin: InkPlugin;
	file: TFile;
	svgString: string;
};

const pendingPreviewRefreshes = new Map<string, PendingPreviewRefresh>();

export function allowNativeInkPdfPreviewsForNextExport(timeoutMs = 120000): void {
	nativePdfPreviewUntil = Date.now() + timeoutMs;
}

export function shouldUseNativeInkPdfPreviews(): boolean {
	return Date.now() < nativePdfPreviewUntil;
}

export function getInkPdfPreviewPath(svgPath: string): string {
	return normalizePath(svgPath.replace(/\.svg$/i, '.png'));
}

/** PNG markers use the same basename as their editable SVG attachment. */
export function getInkSourcePathFromEmbedPath(embedPath: string): string {
	return normalizePath(embedPath.replace(/\.png$/i, '.svg'));
}

export function isInkPdfPreviewPath(path: string): boolean {
	return /\.png$/i.test(path);
}

/**
 * Rasterize an Ink SVG once for Obsidian's PDF exporter, which omits local SVG
 * attachments. The SVG remains the editable source; this PNG is only a preview.
 */
export async function writeInkPdfPreview(
	plugin: InkPlugin,
	file: TFile,
	svgString?: string,
): Promise<string> {
	const svg = svgString ?? await plugin.app.vault.cachedRead(file);
	const dimensions = readSvgDimensions(svg);
	if (!dimensions) throw new Error(`Ink SVG has no valid viewBox: ${file.path}`);

	const dataUri = await svgToPngDataUri({ ...dimensions, svg });
	if (!dataUri) throw new Error(`Could not render PDF preview: ${file.path}`);

	await savePngExport(plugin, dataUri, file);
	return getInkPdfPreviewPath(file.path);
}

/**
 * Coalesce autosaves and do no work for legacy SVG-only embeds. Once a PNG
 * companion exists, its refresh runs after the pen has been idle for a moment.
 */
export function scheduleInkPdfPreviewRefresh(
	plugin: InkPlugin,
	file: TFile,
	svgString: string,
): void {
	const previewPath = getInkPdfPreviewPath(file.path);
	const previewFile = plugin.app.vault.getAbstractFileByPath(previewPath);
	if (!(previewFile instanceof TFile)) return;

	const previous = pendingPreviewRefreshes.get(file.path);
	if (previous) window.clearTimeout(previous.timer);

	const pending: PendingPreviewRefresh = {
		plugin,
		file,
		svgString,
		timer: window.setTimeout(() => {
			pendingPreviewRefreshes.delete(file.path);
			void writeInkPdfPreview(plugin, file, svgString).catch((error) => {
				console.error('Unable to refresh Ink PDF preview', error);
			});
		}, PDF_PREVIEW_REFRESH_DELAY_MS),
	};
	pendingPreviewRefreshes.set(file.path, pending);
}

function readSvgDimensions(svg: string): { width: number; height: number } | null {
	const match = svg.match(/<svg\b[^>]*\bviewBox\s*=\s*["']([^"']+)["']/i);
	if (!match) return null;
	const parts = match[1].trim().split(/[\s,]+/).map(Number);
	if (parts.length < 4) return null;
	const width = parts[2];
	const height = parts[3];
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
	return { width, height };
}
