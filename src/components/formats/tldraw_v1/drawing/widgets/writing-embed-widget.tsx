// import { getAssetUrlsByMetaUrl } from '@tldraw/assets/urls';
import { MarkdownRenderChild, MarkdownView, TFile } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { InkFileData } from "src/logic/utils/page-file";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";
import { WritingEmbedData as WritingEmbedData, applyCommonAncestorStyling, removeEmbed } from "src/logic/utils/embed";
import InkPlugin from "src/main";
import WritingEmbed from "src/components/formats/tldraw_v1/writing/writing-embed-editor/writing-embed";
import { WRITE_EMBED_KEY } from "src/constants";
import { 
	Provider as JotaiProvider
} from "jotai";
import { buildFileStr } from "src/logic/utils/buildFileStr";

////////
////////

interface EmbedCtrls {
	removeEmbed: Function,
}

////////

export function registerWritingEmbed(plugin: InkPlugin) {
	plugin.registerMarkdownCodeBlockProcessor(
		WRITE_EMBED_KEY,
		(source, el, ctx) => {
			const embedData = JSON.parse(source) as WritingEmbedData;
			const embedCtrls: EmbedCtrls = {
				removeEmbed: () => removeEmbed(plugin, ctx, el),
			}
			if(embedData.filepath) {
				ctx.addChild(new WritingEmbedWidget(el, plugin, embedData, embedCtrls));
			}
		}
	);
}

class WritingEmbedWidget extends MarkdownRenderChild {
	el: HTMLElement;
	plugin: InkPlugin;
	embedData: WritingEmbedData;
	embedCtrls: EmbedCtrls;
	root: Root;
	fileRef: TFile | null;
	
	constructor(
		el: HTMLElement,
		plugin: InkPlugin,
		embedData: WritingEmbedData,
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
			this.el.createEl('p').textContent = 'Ink writing file not found: ' + this.embedData.filepath;
			return;
		}

        const pageDataStr = await v.read(this.fileRef);
        let pageData: InkFileData | null = null;
        try {
            pageData = JSON.parse(pageDataStr) as InkFileData;
        } catch (e) {
            pageData = extractInkJsonFromSvg(pageDataStr);
        }
        if (!pageData) {
            this.el.createEl('p').textContent = 'Ink writing file invalid.';
            return;
        }

		if(!this.root) this.root = createRoot(this.el);
		this.root.render(
			<JotaiProvider>
				<WritingEmbed
					plugin = {this.plugin}
					writingFileRef = {this.fileRef}
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
        const pageDataStr = buildFileStr(pageData);
		await this.plugin.app.vault.modify(this.fileRef, pageDataStr);
	}

}