import { INK_EMBED_BASE_URL } from "src/constants";
import {
	DEFAULT_EMBED_SETTINGS,
	buildNewDrawingEmbedSettings,
	formatEmbedAspectRatio,
	type EmbedSettings,
} from "src/types/embed-settings";

// V2 builder: Inserts an image embed + settings link that the v2 CM6 extension detects

export const buildDrawingEmbed = (
	filepath: string,
	options?: {
		pendingPaste?: boolean;
		writingAlignedViewBox?: boolean;
		embedSettings?: EmbedSettings;
	},
): string => {
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

	// Leading space before '!' and newline after are important for the CM6 detector
	// Full URL with type=InkDrawing
	const url = `${INK_EMBED_BASE_URL}?type=inkDrawing&${params.toString()}`;
	const line = ` ![InkDrawing](<${filepath}>) [Edit Drawing](${url})`;
	return `\n${line}\n`;
};
// V2 builder: Inserts an image embed + settings link that the v2 CM6 writing extension detects

export const buildWritingEmbed = (filepath: string, options?: { pendingPaste?: boolean }): string => {
	const params = new URLSearchParams();
	if (options?.pendingPaste) params.append('pendingPaste', 'true');

	const query = params.toString();
	const url = query
		? `${INK_EMBED_BASE_URL}?type=inkWriting&${query}`
		: `${INK_EMBED_BASE_URL}?type=inkWriting`;
	// Leading space before '!' and newline after are important for the CM6 detector
	const line = ` ![InkWriting](<${filepath}>) [Edit Writing](${url})`;
	return `\n${line}\n`;
};
