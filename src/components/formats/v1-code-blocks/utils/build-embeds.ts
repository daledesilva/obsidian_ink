import { PLUGIN_VERSION, DRAWING_INITIAL_WIDTH, DRAWING_INITIAL_ASPECT_RATIO, DRAW_EMBED_KEY, WRITE_EMBED_KEY } from "src/constants";
import { WritingEmbedData } from "src/logic/utils/embed";

//////////
//////////

export type DrawingEmbedData_v1 = {
	versionAtEmbed: string;
	filepath: string;
	width?: number;
	aspectRatio?: number;
};

export const buildDrawingEmbed_v1 = (filepath: string) => {
	let embedContent: DrawingEmbedData_v1 = {
		versionAtEmbed: PLUGIN_VERSION,
		filepath,
		width: DRAWING_INITIAL_WIDTH,
		aspectRatio: DRAWING_INITIAL_ASPECT_RATIO,
	};

	let embedStr = "";
	embedStr += "\n```" + DRAW_EMBED_KEY;
	embedStr += "\n" + JSON.stringify(embedContent, null, '\t');
	embedStr += "\n```";

	// Adds a blank line at the end so it's easy to place the cursor after
	embedStr += "\n";

	return embedStr;
};// Primary functions
///////


export const buildWritingEmbed_v1 = (filepath: string, transcript?: string) => {
	let embedContent: WritingEmbedData = {
		versionAtEmbed: PLUGIN_VERSION,
		filepath,
		// transcript,
	};

	let embedStr = "";
	embedStr += "\n```" + WRITE_EMBED_KEY;
	embedStr += "\n" + JSON.stringify(embedContent, null, '\t');
	embedStr += "\n```";

	// Adds a blank line at the end so it's easy to place the cursor after
	embedStr += "\n";

	return embedStr;
};

