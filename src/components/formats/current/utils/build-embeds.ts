import { INK_EMBED_BASE_URL } from "src/constants";
import { DEFAULT_EMBED_SETTINGS } from "src/types/embed-settings";

// V2 builder: Inserts an image embed + settings link that the v2 CM6 extension detects

export const buildDrawingEmbed = (filepath: string): string => {
	const s = DEFAULT_EMBED_SETTINGS;
	const params = new URLSearchParams({
		version: String(s.version),
		width: String(s.embedDisplay.width),
		aspectRatio: String(s.embedDisplay.aspectRatio),
		viewBoxX: String(s.viewBox.x),
		viewBoxY: String(s.viewBox.y),
		viewBoxWidth: String(s.viewBox.width),
		viewBoxHeight: String(s.viewBox.height),
	});

	// Leading space before '!' and newline after are important for the CM6 detector
	// Full URL with type=InkDrawing
	const url = `${INK_EMBED_BASE_URL}?type=inkDrawing&${params.toString()}`;
	const line = ` ![InkDrawing](<${filepath}>) [Edit Drawing](${url})`;
	return `\n${line}\n`;
};
// V2 builder: Inserts an image embed + settings link that the v2 CM6 writing extension detects

export const buildWritingEmbed = (filepath: string): string => {
	const s = DEFAULT_EMBED_SETTINGS;
	const params = new URLSearchParams({
		version: String(s.version),
	});

	// Full URL with type=InkWriting
	const url = `${INK_EMBED_BASE_URL}?type=inkWriting&${params.toString()}`;
	// Leading space before '!' and newline after are important for the CM6 detector
	const line = ` ![InkWriting](<${filepath}>) [Edit Writing](${url})`;
	return `\n${line}\n`;
};
