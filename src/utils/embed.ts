
///////
///////

import { MarkdownViewModeType } from "obsidian";
import { DRAW_EMBED_KEY, PLUGIN_VERSION, WRITE_EMBED_KEY } from "src/constants";

export type WritingEmbedData = {
	versionAtEmbed: string;
	filepath: string;
	transcript?: string;
};


// Primary functions
///////

export const buildWritingEmbed = (filepath: string, transcript?: string) => {
	let embedContent: WritingEmbedData = {
		versionAtEmbed: PLUGIN_VERSION,
		filepath,
		// transcript,
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

export type DrawingEmbedData = {
	versionAtEmbed: string;
	filepath: string;
};

export const buildDrawingEmbed = (filepath: string) => {
	let embedContent: DrawingEmbedData = {
		versionAtEmbed: PLUGIN_VERSION,
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

export function applyCommonAncestorStyling(embedEl: HTMLElement) {
	const parentEmbedBlockEl = embedEl.closest('.cm-embed-block') as HTMLElement;
	if(!parentEmbedBlockEl) return;
	
	parentEmbedBlockEl.classList.add('ddc_ink_embed-block');
	
	const parentPageScrollerEl = embedEl.closest('.cm-scroller') as HTMLElement;
	const scrollerStyle = window.getComputedStyle(parentPageScrollerEl);
	
	const m = scrollerStyle.paddingLeft;

	let style = parentEmbedBlockEl.getAttribute('style') ?? '';
	style += `; margin-left: calc(-${m} + 4px) !important`;
	style += `; margin-right: calc(-${m} + 4px) !important`;
	parentEmbedBlockEl.setAttribute('style', style);
}