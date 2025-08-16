import { EditorPosition, MarkdownPostProcessorContext, MarkdownViewModeType } from "obsidian";
import { DRAW_EMBED_KEY } from "src/constants";
import InkPlugin from "src/main";
import { DrawingEmbedData_v1 } from "../../components/formats/v1-code-blocks/utils/build-embeds";

///////
///////

export type WritingEmbedData = {
	versionAtEmbed: string;
	filepath: string;
	transcript?: string;
};


export function stringifyEmbedData(embedData: DrawingEmbedData_v1): string {
	return JSON.stringify(embedData, null, '\t');
}

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