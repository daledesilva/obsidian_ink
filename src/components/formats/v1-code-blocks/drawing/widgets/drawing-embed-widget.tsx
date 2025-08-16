// import { getAssetUrlsByMetaUrl } from '@tldraw/assets/urls';
import { EditorPosition, MarkdownPostProcessorContext, MarkdownRenderChild, TFile } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { InkFileData_v1 } from "src/components/formats/v1-code-blocks/types/file-data";
import { applyCommonAncestorStyling, removeEmbed, stringifyEmbedData } from "src/logic/utils/embed";
import { DrawingEmbedData_v1 } from "src/components/formats/v1-code-blocks/utils/build-embeds";
import { buildFileStr } from "src/logic/utils/buildFileStr";
import InkPlugin from "src/main";
import DrawingEmbed from "src/components/formats/v1-code-blocks/drawing/drawing-embed-editor/drawing-embed";
import { DRAW_EMBED_KEY } from "src/constants";
import { 
	Provider as JotaiProvider
} from "jotai";

////////
////////

interface EmbedCtrls_v1 {
	removeEmbed: Function,
}

////////

export function registerDrawingEmbed_v1(plugin: InkPlugin) {

	plugin.registerMarkdownCodeBlockProcessor(
		DRAW_EMBED_KEY,
		(source, el, ctx) => {
			const embedData = JSON.parse(source) as DrawingEmbedData_v1;
			const embedCtrls: EmbedCtrls_v1 = {
				removeEmbed: () => removeEmbed(plugin, ctx, el),
			}
			if(embedData.filepath) {
				ctx.addChild(new DrawingEmbedWidget_v1(el, plugin, embedData, embedCtrls, (newEmbedData) => updateEmbed_v1(plugin, ctx, el, newEmbedData)));
			}
		}
	);

}

// let updateTimer: NodeJS.Timeout;
function updateEmbed_v1(plugin: InkPlugin, ctx: MarkdownPostProcessorContext, el: HTMLElement, embedData: DrawingEmbedData_v1) {
	// clearTimeout(updateTimer);

	// NOTE: The timeout stuff was here because I was trying to do this on every save... but it remounts the whole embed.
	// updateTimer = setTimeout( () => {
		
		const cmEditor = plugin.app.workspace.activeEditor?.editor;
		if(!cmEditor) return;
	
		const sectionInfo = ctx.getSectionInfo(el);
		if(sectionInfo?.lineStart === undefined || sectionInfo.lineEnd === undefined) return;
	
		const embedStart: EditorPosition = {
			line: sectionInfo.lineStart + 1,
			ch: 0,
		}
		const embedEnd: EditorPosition = {
			line: sectionInfo.lineEnd - 1,
			ch: 1, // To allow for the closing } bracket
		}
		
		cmEditor.replaceRange( stringifyEmbedData(embedData), embedStart, embedEnd );

		// So even though it doesn't activate the visible cursor again when the embed updates & locks, it scrolls the cursors last position.
		// This prevents that.
		cmEditor.setCursor(embedStart);

	// }, 1000)
	
}

class DrawingEmbedWidget_v1 extends MarkdownRenderChild {
	el: HTMLElement;
	plugin: InkPlugin;
	embedData: DrawingEmbedData_v1;
	embedCtrls: EmbedCtrls_v1;
	root: Root;
	fileRef: TFile | null;
	updateEmbed: Function;

	constructor(
		el: HTMLElement,
		plugin: InkPlugin,
		embedData: DrawingEmbedData_v1,
		embedCtrls: EmbedCtrls_v1,
		updateEmbed: (embedData: DrawingEmbedData_v1) => void,
	) {
		super(el);
		this.el = el;
		this.plugin = plugin;
		this.embedData = embedData;
		this.embedCtrls = embedCtrls;
		this.updateEmbed = updateEmbed;
	}

	async onload() {
		const v = this.plugin.app.vault;
		this.fileRef = v.getAbstractFileByPath(this.embedData.filepath) as TFile;
		
		if( !this.fileRef || !(this.fileRef instanceof TFile) ) {
			this.el.createEl('p').textContent = 'Ink drawing file not found.';
			return;
		}

		const pageDataStr = await v.read(this.fileRef);
		const pageData = JSON.parse(pageDataStr) as InkFileData_v1;

		this.root = createRoot(this.el);
		this.root.render(
			<JotaiProvider>
				<DrawingEmbed
					plugin = {this.plugin}
					drawingFileRef = {this.fileRef}
					pageData = {pageData}
					saveSrcFile = {this.save}
					setEmbedProps = {this.setEmbedProps}
					remove = {this.embedCtrls.removeEmbed}
					width = {this.embedData.width}
					aspectRatio = {this.embedData.aspectRatio}
				/>
			</JotaiProvider>
        );

		applyCommonAncestorStyling(this.el)
	}

	async onunload() {
		this.root?.unmount();
	}

	// Helper functions
	///////////////////

	save = async (pageData: InkFileData_v1) => {
		if(!this.fileRef) return;
        const pageDataStr = buildFileStr(pageData);
		await this.plugin.app.vault.modify(this.fileRef, pageDataStr);
	}

	setEmbedProps = async (width: number, aspectRatio: number) => {
		const newEmbedData: DrawingEmbedData_v1 = {
			...this.embedData,
			width,
			aspectRatio,
		}
		this.updateEmbed(newEmbedData);
	}

}



