import { EditorPosition, MarkdownPostProcessorContext, MarkdownViewModeType } from "obsidian";
import { DRAW_EMBED_KEY, DRAWING_INITIAL_ASPECT_RATIO, DRAWING_INITIAL_WIDTH, PLUGIN_VERSION, WRITE_EMBED_KEY } from "src/constants";
import InkPlugin from "src/main";
import { DEFAULT_EMBED_SETTINGS } from "src/types/embed-settings";

///////
///////

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
	width?: number,
	aspectRatio?: number,
};

export const buildDrawingEmbed = (filepath: string) => {
	let embedContent: DrawingEmbedData = {
		versionAtEmbed: PLUGIN_VERSION,
		filepath,
		width: DRAWING_INITIAL_WIDTH,
		aspectRatio: DRAWING_INITIAL_ASPECT_RATIO,
	}

	let embedStr = "";
    embedStr += "\n```" + DRAW_EMBED_KEY;
    embedStr += "\n" + JSON.stringify(embedContent, null, '\t');
    embedStr += "\n```";

	// Adds a blank line at the end so it's easy to place the cursor after
    embedStr += "\n";

	return embedStr;
};

export function stringifyEmbedData(embedData: DrawingEmbedData): string {
	return JSON.stringify(embedData, null, '\t');
}
export const rebuildDrawingEmbed = (embedData: DrawingEmbedData) => {
	let embedStr = "";
    embedStr += "\n```" + DRAW_EMBED_KEY;
    embedStr += "\n" + stringifyEmbedData(embedData);
    embedStr += "\n```";
	return embedStr;
};

// V2 builder: Inserts an image embed + settings link that the v2 CM6 extension detects
export const buildDrawingEmbedV2 = (filepath: string): string => {
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
    const line = ` ![InkDrawing](<${filepath}>) [Edit Drawing](ink?${params.toString()})`;
    return `\n${line}\n`;
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
	
	const scrollerInlineStartMargin = scrollerStyle.paddingInlineStart;
	const scrollerInlineEndMargin = scrollerStyle.paddingInlineEnd;
	const scrollerMarginLeft = scrollerStyle.paddingLeft;
	const scrollerMarginRight = scrollerStyle.paddingRight;

	const pageHasScrollerInlineStartMargin = scrollerInlineStartMargin && scrollerInlineStartMargin !== '0' && scrollerInlineStartMargin !== '0px';
	if(pageHasScrollerInlineStartMargin) {
		let style = parentEmbedBlockEl.getAttribute('style') ?? '';
		// Negate the scroller margin
		style += `; margin-inline-start: calc(-1 * ${scrollerInlineStartMargin} + 4px) !important`;
		parentEmbedBlockEl.setAttribute('style', style);

	} else {
		// Let it remain auto centered

	}

	const pageHasScrollerInlineEndMargin = scrollerInlineEndMargin && scrollerInlineEndMargin !== '0' && scrollerInlineEndMargin !== '0px';
	if(pageHasScrollerInlineEndMargin) {
		let style = parentEmbedBlockEl.getAttribute('style') ?? '';
		// Negate the scroller margin
		style += `; margin-inline-end: calc(-1 * ${scrollerInlineEndMargin} + 4px) !important`;
		parentEmbedBlockEl.setAttribute('style', style);

	} else {
		// Let it remain auto centered

	}
}

/**
 * Removes an element from a markdown in the active editor.
 * Pass in the context and el used when creating the embed.
 * @param plugin 
 * @param ctx 
 * @param el 
 * @returns 
 */
export function removeEmbed(plugin: InkPlugin, ctx: MarkdownPostProcessorContext, el: HTMLElement) {
	const cmEditor = plugin.app.workspace.activeEditor?.editor;
	if(!cmEditor) return;

	const sectionInfo = ctx.getSectionInfo(el);

	if(sectionInfo?.lineStart === undefined || sectionInfo.lineEnd === undefined) return;

	const editorStart: EditorPosition = {
		line: sectionInfo.lineStart,
		ch: 0,
	}
	const editorEnd: EditorPosition = {
		line: sectionInfo.lineEnd + 1,
		ch: 0,
	}

	cmEditor.replaceRange( '', editorStart, editorEnd );

	// NOTE: The page scroll position can jump significantly off when an embed is removed.
	// This puts it back where the user expects.
	cmEditor.setCursor(editorStart);
}