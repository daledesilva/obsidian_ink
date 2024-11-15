// import { getAssetUrlsByMetaUrl } from '@tldraw/assets/urls';
import { EditorPosition, MarkdownPostProcessorContext, MarkdownRenderChild, TFile } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { InkFileData, stringifyPageData } from "src/utils/page-file";
import { DrawingEmbedData, applyCommonAncestorStyling, removeEmbed } from "src/utils/embed";
import InkPlugin from "src/main";
import DrawingEmbed from "src/tldraw/drawing/drawing-embed";
import { DRAW_EMBED_KEY } from "src/constants";
import { Provider } from "react-redux";
import { store } from "src/logic/stores";
import { 
	Provider as JotaiProvider
} from "jotai";

////////
////////

interface EmbedCtrls {
	removeEmbed: Function,
}

////////

export function registerDrawingEmbed(plugin: InkPlugin) {

	plugin.registerMarkdownCodeBlockProcessor(
		DRAW_EMBED_KEY,
		(source, el, ctx) => {
			const embedData = JSON.parse(source) as DrawingEmbedData;
			const embedCtrls: EmbedCtrls = {
				removeEmbed: () => removeEmbed(plugin, ctx, el),
			}
			if(embedData.filepath) {
				ctx.addChild(new DrawingEmbedWidget(el, plugin, embedData, embedCtrls));
			}
		}
	);

}

class DrawingEmbedWidget extends MarkdownRenderChild {
	el: HTMLElement;
	plugin: InkPlugin;
	embedData: DrawingEmbedData;
	embedCtrls: EmbedCtrls;
	root: Root;
	fileRef: TFile | null;

	constructor(
		el: HTMLElement,
		plugin: InkPlugin,
		embedData: DrawingEmbedData,
		embedCtrls: EmbedCtrls,
	) {
		super(el);
		this.el = el;
		this.plugin = plugin;
		this.embedData = embedData;
		this.embedCtrls = embedCtrls;
	}

	async onload() {
		const v = this.plugin.app.vault;
		this.fileRef = v.getAbstractFileByPath(this.embedData.filepath) as TFile;
		
		if( !this.fileRef || !(this.fileRef instanceof TFile) ) {
			this.el.createEl('p').textContent = 'Ink drawing file not found.';
			return;
		}

		const pageDataStr = await v.read(this.fileRef);
		const pageData = JSON.parse(pageDataStr) as InkFileData;

		this.root = createRoot(this.el);
		this.root.render(
			<JotaiProvider>
				<DrawingEmbed
					plugin = {this.plugin}
					drawingFileRef = {this.fileRef}
					pageData = {pageData}
					save = {this.save}
					remove = {this.embedCtrls.removeEmbed}
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

	save = async (pageData: InkFileData) => {
		if(!this.fileRef) return;
		const pageDataStr = stringifyPageData(pageData);
		await this.plugin.app.vault.modify(this.fileRef, pageDataStr);
	}

}



