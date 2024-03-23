
///////
///////

import { MarkdownViewModeType } from "obsidian";
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
	
	// Adds a blank line at the end so it's easy to place the cursor after
    embedStr += "\n";

	return embedStr;
};

//////////
//////////

const DRAWING_EMBED_VERSION = '0.0.1';

export type DrawingEmbedData = {
	embedVersion: string;
	filepath: string;
};

export const buildDrawingEmbed = (filepath: string, transcript: string = '') => {
	let embedContent: DrawingEmbedData = {
		embedVersion: DRAWING_EMBED_VERSION,
		filepath,
	}

	let embedStr = "";
    embedStr += "\n```" + DRAW_EMBED_KEY;
    embedStr += "\n" + JSON.stringify(embedContent, null, '\t');
    embedStr += "\n```";

	// Adds a blank line at the end so it's easy to place the cursor after
    embedStr += "\n";

	return embedStr;
};

// This function came from Notion like tables code
export const getViewMode = (el: HTMLElement): MarkdownViewModeType | null => {
	const parent = el.parentElement;
	if (parent) {
		return parent.className.includes("cm-preview-code-block")
			? "source"
			: "preview";
	}
	return null;
};