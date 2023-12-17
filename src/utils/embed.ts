
///////
///////

import { DRAW_EMBED_KEY, WRITE_EMBED_KEY } from "src/constants";

const WRITING_EMBED_VERSION = '0.0.1';

export type WritingEmbedData = {
	embedVersion: string;
	filepath: string;
	transcript: string;
};


// Primary functions
///////

export const buildWritingEmbed = (filepath: string, transcript: string = '') => {
	let embedContent: WritingEmbedData = {
		embedVersion: WRITING_EMBED_VERSION,
		filepath,
		transcript,
	}

	let embedStr = "";
    embedStr += "\n```" + WRITE_EMBED_KEY;
    embedStr += "\n" + JSON.stringify(embedContent, null, '\t');
    embedStr += "\n```";

	return embedStr;
};

//////////
//////////

const DRAWING_EMBED_VERSION = '0.0.1';

export type DrawingEmbedData = {
	embedVersion: string;
	filepath: string;
};


// Primary functions
///////

export const buildDrawingEmbed = (filepath: string, transcript: string = '') => {
	let embedContent: DrawingEmbedData = {
		embedVersion: DRAWING_EMBED_VERSION,
		filepath,
	}

	let embedStr = "";
    embedStr += "\n```" + DRAW_EMBED_KEY;
    embedStr += "\n" + JSON.stringify(embedContent, null, '\t');
    embedStr += "\n```";

	return embedStr;
};

