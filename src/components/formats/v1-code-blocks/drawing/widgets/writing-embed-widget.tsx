// import { getAssetUrlsByMetaUrl } from '@tldraw/assets/urls';
import { MarkdownRenderChild, MarkdownView, TFile } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { InkFileData_v1 } from "src/components/formats/v1-code-blocks/types/file-data";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";
import { WritingEmbedData, applyCommonAncestorStyling, removeEmbed } from "src/logic/utils/embed";
import { Notice } from "obsidian";
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
	removeEmbed: Function,
}

////////

export function registerWritingEmbed_v1(plugin: InkPlugin) {
	plugin.registerMarkdownCodeBlockProcessor(
		WRITE_EMBED_KEY,
		(source, el, ctx) => {
			const embedData = JSON.parse(source) as WritingEmbedData;
			const embedCtrls: EmbedCtrls_v1 = {
				removeEmbed: async () => {
					// 检查是否存在文件路径
					if (!embedData.filepath) {
						removeEmbed(plugin, ctx, el);
						return;
					}

					// 查找文件
					const file = plugin.app.vault.getAbstractFileByPath(embedData.filepath);
					if (!file || !(file instanceof TFile)) {
						removeEmbed(plugin, ctx, el);
						return;
					}

					// 显示确认对话框
					if (confirm(`确定要移除嵌入内容并删除文件 "${file.name}" 吗？此操作无法撤销。`)) {
						try {
							// 删除文件
							await plugin.app.vault.delete(file, true);
							new Notice(`文件 "${file.name}" 已成功删除`);
						} catch (error) {
							console.error("删除文件时出错:", error);
							new Notice("删除文件时出错，请检查控制台日志");
						}

						// 无论文件删除是否成功，都从文档中移除嵌入内容
						removeEmbed(plugin, ctx, el);
					}
				}
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

	async onload() {
		const v = this.plugin.app.vault;
		this.fileRef = v.getAbstractFileByPath(this.embedData.filepath) as TFile;
		
		if( !this.fileRef || !(this.fileRef instanceof TFile) ) {
			this.el.createEl('p').textContent = 'Ink writing file not found: ' + this.embedData.filepath;
			return;
		}

        const pageDataStr = await v.read(this.fileRef);
        let pageData: InkFileData_v1 | null = null;
        try {
            pageData = JSON.parse(pageDataStr) as InkFileData_v1;
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
				<WritingEmbed_v1
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

	save = async (pageData: InkFileData_v1) => {
		
		if(!this.fileRef) return;
        const pageDataStr = buildFileStr_v1(pageData);
		await this.plugin.app.vault.modify(this.fileRef, pageDataStr);
	}

}