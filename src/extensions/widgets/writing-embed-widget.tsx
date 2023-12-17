import { Editor, SerializedStore, Store, StoreSnapshot, TLGeoShape, TLRecord, TLShapePartial, Tldraw, createShapeId, createTLStore, parseTldrawJsonFile } from "@tldraw/tldraw";
// import { getAssetUrlsByMetaUrl } from '@tldraw/assets/urls';
import { MarkdownRenderChild, MarkdownViewModeType, Plugin, TAbstractFile, TFile, debounce, } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { PageData, buildPageFile } from "src/utils/page-file";
import { WritingEmbedData as WritingEmbedData } from "src/utils/embed";
import InkPlugin from "src/main";
import HandwrittenEmbed from "src/tldraw/writing/writing-embed";
import { WRITE_EMBED_KEY } from "src/constants";

////////
////////


export function registerWritingEmbed(plugin: InkPlugin) {
	plugin.registerMarkdownCodeBlockProcessor(
		WRITE_EMBED_KEY,
		(source, el, ctx) => {
			const embedData = JSON.parse(source) as WritingEmbedData;
			if(embedData.filepath) {
				ctx.addChild(new WritingEmbedWidget(el, plugin, embedData));
			}
		}
	);
}

class WritingEmbedWidget extends MarkdownRenderChild {
	el: HTMLElement;
	plugin: InkPlugin;
	embedData: WritingEmbedData;
	root: Root;
	fileRef: TFile | null;

	constructor(
		el: HTMLElement,
		plugin: InkPlugin,
		embedData: WritingEmbedData,
	) {
		super(el);
		this.el = el;
		this.plugin = plugin;
		this.embedData = embedData;
	}


	async onload() {
		const v = this.plugin.app.vault;
		this.fileRef = v.getAbstractFileByPath(this.embedData.filepath) as TFile;
		
		if( !this.fileRef || !(this.fileRef instanceof TFile) ) {
			// TODO: This is added, but is not visible
			const containerEl = this.el.createDiv();
			containerEl.createEl('p', 'Writing ink file not found.')
			return;
		}

		const pageDataStr = await v.read(this.fileRef as TFile);
		const pageData = JSON.parse(pageDataStr) as PageData;

		this.root = createRoot(this.el);
		this.root.render(
            <HandwrittenEmbed
				plugin = {this.plugin}
                filepath = {this.embedData.filepath}
				pageData = {pageData}
                save = {this.saveLinkedFile}
			/>
        );
	}

	async onunload() {
		this.root.unmount();
	}

	// Helper functions
	///////////////////

	saveLinkedFile = async (tldrawData: SerializedStore<TLRecord>, pngDataUri: string | null = null) => {
		if(!this.fileRef) return;
		const fileContents = buildPageFile(tldrawData, pngDataUri);
		await this.plugin.app.vault.modify(this.fileRef, fileContents);
		console.log('...Saved');
	}

}