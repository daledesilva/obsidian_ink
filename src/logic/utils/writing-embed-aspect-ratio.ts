import type { TFile } from 'obsidian';
import type InkPlugin from 'src/main';
import { formatEmbedAspectRatio } from 'src/types/embed-settings';

///////////////////////////
///////////////////////////

/**
 * Writing embed CSS height is cached in the note URL as `aspectRatio`, but the
 * SVG root viewBox (written by renderWritingStrokesToSvg) is the authoritative
 * page size after dedicated-view edits or migration. Metadata JSON does not
 * store aspect ratio — parse viewBox width/height instead.
 */
export function parseSvgViewBoxAspectRatio(svgString: string): number | null {
	const viewBoxMatch = svgString.match(/<svg\b[^>]*\bviewBox\s*=\s*["']([^"']+)["']/i);
	if (!viewBoxMatch) return null;

	const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
	if (parts.length < 4) return null;

	const viewBoxWidth = parts[2];
	const viewBoxHeight = parts[3];
	if (!Number.isFinite(viewBoxWidth) || !Number.isFinite(viewBoxHeight)) return null;
	if (viewBoxWidth <= 0 || viewBoxHeight <= 0) return null;

	return viewBoxWidth / viewBoxHeight;
}

/** Compare ratios at the same precision written into embed URL params. */
export function aspectRatiosMatch(a: number, b: number): boolean {
	return formatEmbedAspectRatio(a) === formatEmbedAspectRatio(b);
}

export async function readWritingFileAspectRatio(
	plugin: InkPlugin,
	file: TFile,
): Promise<number | null> {
	try {
		const svgString = await plugin.app.vault.read(file);
		return parseSvgViewBoxAspectRatio(svgString);
	} catch {
		return null;
	}
}

/**
 * Patch `aspectRatio=` on every Edit Writing link for a given embed filepath.
 * Returns null when no embed line is found or all already match.
 */
export function patchWritingEmbedAspectRatioInMarkdown(
	markdown: string,
	embedFilepath: string,
	aspectRatio: number,
): string | null {
	const aspectRatioStr = formatEmbedAspectRatio(aspectRatio);
	const escapedPath = escapeRegExp(embedFilepath);
	// Match writing embed lines whose image target is this filepath.
	// Escape [InkWriting] brackets — otherwise they form a character class.
	const embedLineRegex = new RegExp(
		`( !\\[InkWriting\\]\\(<${escapedPath}>\\) \\[Edit Writing\\]\\()([^)]+)(\\))`,
		'g',
	);

	let didChange = false;
	const updated = markdown.replace(embedLineRegex, (_full, prefix, urlAndParams, suffix) => {
		let updatedUrl = urlAndParams as string;
		if (/aspectRatio=[^&)]+/.test(updatedUrl)) {
			updatedUrl = updatedUrl.replace(/(aspectRatio=)([^&)]+)/, `$1${aspectRatioStr}`);
		} else if (updatedUrl.includes('?')) {
			updatedUrl = `${updatedUrl}&aspectRatio=${aspectRatioStr}`;
		} else {
			updatedUrl = `${updatedUrl}?aspectRatio=${aspectRatioStr}`;
		}
		if (updatedUrl !== urlAndParams) didChange = true;
		return `${prefix}${updatedUrl}${suffix}`;
	});

	return didChange ? updated : null;
}

/**
 * Patch aspectRatio on a single embed markdown snippet (the decoration range),
 * matching WritingEmbedWidget.setEmbedProps URL rewriting.
 */
export function patchWritingEmbedAspectRatioInEmbedSnippet(
	embedSnippet: string,
	aspectRatio: number,
): string {
	const aspectRatioStr = formatEmbedAspectRatio(aspectRatio);
	if (/aspectRatio=[^&)]+/.test(embedSnippet)) {
		return embedSnippet.replace(/(aspectRatio=)([^&)]+)/, `$1${aspectRatioStr}`);
	}
	return embedSnippet.replace(/(\[Edit Writing\]\([^?]+)(\?[^)]*)?(\))/, (_match, p1, p2, p3) => {
		if (p2) {
			return `${p1}${p2}&aspectRatio=${aspectRatioStr}${p3}`;
		}
		return `${p1}?aspectRatio=${aspectRatioStr}${p3}`;
	});
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
