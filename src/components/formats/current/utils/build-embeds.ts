import { INK_EMBED_BASE_URL } from "src/constants";
import {
	DEFAULT_EMBED_SETTINGS,
	buildNewDrawingEmbedSettings,
	formatEmbedAspectRatio,
	type EmbedSettings,
} from "src/types/embed-settings";

// V2 builder: Inserts an image embed + settings link that the v2 CM6 extension detects

/** Single-line embed markdown with required leading space (no block newlines). */
export function buildDrawingEmbedLine(
	filepath: string,
	options?: {
		pendingPaste?: boolean;
		writingAlignedViewBox?: boolean;
		embedSettings?: EmbedSettings;
		transcript?: string;
	},
): string {
	const s = options?.embedSettings
		?? (options?.writingAlignedViewBox
			? buildNewDrawingEmbedSettings()
			: DEFAULT_EMBED_SETTINGS);
	const params = new URLSearchParams({
		width: String(s.embedDisplay.width),
		aspectRatio: formatEmbedAspectRatio(s.embedDisplay.aspectRatio),
		viewBoxX: String(s.viewBox.x),
		viewBoxY: String(s.viewBox.y),
		viewBoxW: String(s.viewBox.width),
		viewBoxH: String(s.viewBox.height),
	});
	if (options?.pendingPaste) params.append('pendingPaste', 'true');

	const url = `${INK_EMBED_BASE_URL}?type=inkDrawing&${params.toString()}`;
	const alt = formatDrawingEmbedAltText(options?.transcript);
	return ` ![${alt}](<${filepath}>) [Edit Drawing](${url})`;
}

/** Placeholder alt text when a drawing embed has no transcript yet. */
export const DRAWING_EMBED_ALT_PLACEHOLDER = 'InkDrawing';

/**
 * Plain-text alt for drawing embeds: one line, no chars that break `![…](…)` or Obsidian `alt|width`.
 */
export function formatDrawingEmbedAltText(transcript?: string): string {
	if (!transcript) return DRAWING_EMBED_ALT_PLACEHOLDER;
	const collapsed = transcript
		.replace(/[\r\n\t]+/g, ' ')
		.replace(/\s+/g, ' ')
		.replace(/[[\]\\|<>]/g, '')
		.trim();
	if (!collapsed) return DRAWING_EMBED_ALT_PLACEHOLDER;
	return collapsed;
}

/**
 * Patch the image alt on a drawing embed snippet (decoration range).
 */
export function patchDrawingEmbedTranscriptInEmbedSnippet(
	embedSnippet: string,
	transcript: string,
): string {
	const alt = formatDrawingEmbedAltText(transcript);
	return embedSnippet.replace(/!\[[^\]]*\]/, `![${alt}]`);
}

export const buildDrawingEmbed = (
	filepath: string,
	options?: {
		pendingPaste?: boolean;
		writingAlignedViewBox?: boolean;
		embedSettings?: EmbedSettings;
		transcript?: string;
	},
): string => {
	const line = buildDrawingEmbedLine(filepath, options);
	return `\n${line}\n`;
};

/** Placeholder alt text when a writing embed has no transcript yet. */
export const WRITING_EMBED_ALT_PLACEHOLDER = 'InkWriting';

/**
 * Plain-text alt for writing embeds: one line, no chars that break `![…](…)` or Obsidian `alt|width`.
 */
export function formatWritingEmbedAltText(transcript?: string): string {
	if (!transcript) return WRITING_EMBED_ALT_PLACEHOLDER;
	const collapsed = transcript
		.replace(/[\r\n\t]+/g, ' ')
		.replace(/\s+/g, ' ')
		.replace(/[[\]\\|<>]/g, '')
		.trim();
	if (!collapsed) return WRITING_EMBED_ALT_PLACEHOLDER;
	return collapsed;
}

/**
 * Patch the image alt on a writing embed snippet (decoration range).
 * Empty / missing transcript keeps the InkWriting placeholder.
 */
export function patchWritingEmbedTranscriptInEmbedSnippet(
	embedSnippet: string,
	transcript: string,
): string {
	const alt = formatWritingEmbedAltText(transcript);
	return embedSnippet.replace(/!\[[^\]]*\]/, `![${alt}]`);
}

/** Single-line embed markdown with required leading space (no block newlines). */
export function buildWritingEmbedLine(
	filepath: string,
	options?: { pendingPaste?: boolean; aspectRatio?: number; transcript?: string },
): string {
	const params = new URLSearchParams();
	// Persist page aspect from the SVG viewBox when known so CM estimatedHeight matches preview.
	if (options?.aspectRatio != null && Number.isFinite(options.aspectRatio) && options.aspectRatio > 0) {
		params.append('aspectRatio', formatEmbedAspectRatio(options.aspectRatio));
	}
	if (options?.pendingPaste) params.append('pendingPaste', 'true');

	const query = params.toString();
	const url = query
		? `${INK_EMBED_BASE_URL}?type=inkWriting&${query}`
		: `${INK_EMBED_BASE_URL}?type=inkWriting`;
	const alt = formatWritingEmbedAltText(options?.transcript);
	return ` ![${alt}](<${filepath}>) [Edit Writing](${url})`;
}

export const buildWritingEmbed = (
	filepath: string,
	options?: { pendingPaste?: boolean; aspectRatio?: number; transcript?: string },
): string => {
	const line = buildWritingEmbedLine(filepath, options);
	return `\n${line}\n`;
};
