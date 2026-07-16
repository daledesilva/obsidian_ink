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
	return ` ![InkDrawing](<${filepath}>) [Edit Drawing](${url})`;
}

export const buildDrawingEmbed = (
	filepath: string,
	options?: {
		pendingPaste?: boolean;
		writingAlignedViewBox?: boolean;
		embedSettings?: EmbedSettings;
	},
): string => {
	const line = buildDrawingEmbedLine(filepath, options);
	return `\n${line}\n`;
};

/** Single-line embed markdown with required leading space (no block newlines). */
export function buildWritingEmbedLine(
	filepath: string,
	options?: { pendingPaste?: boolean; aspectRatio?: number },
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
	return ` ![InkWriting](<${filepath}>) [Edit Writing](${url})`;
}

export const buildWritingEmbed = (
	filepath: string,
	options?: { pendingPaste?: boolean; aspectRatio?: number },
): string => {
	const line = buildWritingEmbedLine(filepath, options);
	return `\n${line}\n`;
};
