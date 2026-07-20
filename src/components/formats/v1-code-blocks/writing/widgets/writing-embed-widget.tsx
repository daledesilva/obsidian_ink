// import { getAssetUrlsByMetaUrl } from '@tldraw/assets/urls';
import { MarkdownRenderChild, TFile } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { InkFileData_v1 } from "src/components/formats/v1-code-blocks/types/file-data";
import { WritingEmbedData, applyCommonAncestorStyling, removeEmbed } from "src/logic/utils/embed";
import { buildFileStr_v1 } from "src/components/formats/v1-code-blocks/utils/buildFileStr";
import InkPlugin from "src/main";
import { WritingEmbed_v1 } from "src/components/formats/v1-code-blocks/writing/writing-embed-editor/writing-embed";
import { WRITE_EMBED_KEY } from "src/constants";
import { 
	Provider as JotaiProvider
} from "jotai";

////////
////////

interface EmbedCtrls_v1 {
	removeEmbed: () => void,
}

////////

export function registerWritingEmbed_v1(plugin: InkPlugin) {
	plugin.registerMarkdownCodeBlockProcessor(
		WRITE_EMBED_KEY,
		(source, el, ctx) => {
			const embedData = JSON.parse(source) as WritingEmbedData;
			const embedCtrls: EmbedCtrls_v1 = {
				removeEmbed: () => removeEmbed(plugin, ctx, el),
			}
			if(embedData.filepath) {
				ctx.addChild(new WritingEmbedWidget_v1(el, plugin, embedData, embedCtrls));
			}
		}
	);
}

class WritingEmbedWidget_v1 extends MarkdownRenderChild {
	el: HTMLElement;
	plugin: InkPlugin;
	embedData: WritingEmbedData;
	embedCtrls: EmbedCtrls_v1;
	root: Root;
	fileRef: TFile | null;
	
	constructor(
		el: HTMLElement,
		plugin: InkPlugin,
		embedData: WritingEmbedData,
		embedCtrls: EmbedCtrls_v1,
	) {
		super(el);
		this.el = el;
		this.plugin = plugin;
		this.embedData = embedData;
		this.embedCtrls = embedCtrls;
	}

	onload(): void {
		void this.mountWritingEmbedWidget();
	}

	// REVIEW: Risky AI change. Monitor this.
	private async mountWritingEmbedWidget() {
		const v = this.plugin.app.vault;
		const abstractFile = v.getAbstractFileByPath(this.embedData.filepath);
		this.fileRef = abstractFile instanceof TFile ? abstractFile : null;

		if (!this.fileRef) {
			this.el.createEl('p').textContent = 'Ink writing file not found: ' + this.embedData.filepath;
			return;
		}

		const pageDataStr = await v.read(this.fileRef);
		const pageData = JSON.parse(pageDataStr) as InkFileData_v1;

		if(!this.root) this.root = createRoot(this.el);
		this.root.render(
			<JotaiProvider>
				<WritingEmbed_v1
					plugin = {this.plugin}
					writingFileRef = {this.fileRef}
					pageData = {pageData}
					save = {(embeddedPageData) => void this.save(embeddedPageData)}
					remove = {this.embedCtrls.removeEmbed}
				/>
			</JotaiProvider>
		);

		applyCommonAncestorStyling(this.el)
	}

	onunload() {
		this.root?.unmount();
	}

	// Helper functions
	///////////////////

	save = async (pageData: InkFileData_v1) => {
		
		if(!this.fileRef) return;
        const pageDataStr = buildFileStr_v1(pageData);
		await this.plugin.app.vault.modify(this.fileRef, pageDataStr);
	}

}