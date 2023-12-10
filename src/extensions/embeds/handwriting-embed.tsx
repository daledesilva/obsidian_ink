import { Editor, SerializedStore, Store, StoreSnapshot, TLGeoShape, TLRecord, TLShapePartial, Tldraw, createShapeId, createTLStore, parseTldrawJsonFile } from "@tldraw/tldraw";
// import { getAssetUrlsByMetaUrl } from '@tldraw/assets/urls';
import { MarkdownRenderChild, MarkdownViewModeType, Plugin, TAbstractFile, TFile, debounce, } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { PageData, buildPageFile } from "src/utils/page-file";
import { HandwrittenEmbedData } from "src/utils/embed";
import { HandwrittenEmbed } from "src/tldraw/handwritten-embed";



// Import scss file so that compiler adds it.
// This is instead of injecting it using EditorView.baseTheme
// This allow syou to write scss in an external file and have it refresh during dev better.
import './handwriting-embed.scss';


export function registerHandwritingEmbed(plugin: Plugin) {
	plugin.registerMarkdownCodeBlockProcessor(
		'handwritten-ink',
		(source, el, ctx) => {
			const embedJson = JSON.parse(source) as HandwrittenEmbedData;
			if(embedJson.filepath) {
				ctx.addChild(new HandwrittenEmbedWidget(el, plugin, embedJson.filepath));
			}
		}
	);
}

class HandwrittenEmbedWidget extends MarkdownRenderChild {
	el: HTMLElement;
	plugin: Plugin;
	filepath: string;
	root: Root;
	fileRef: TFile | null;

	constructor(
		el: HTMLElement,
		plugin: Plugin,
		filepath: string,
	) {
		super(el);
		this.el = el;
		this.plugin = plugin;
		this.filepath = filepath;
	}


	async onload() {
		const v = this.plugin.app.vault;
		this.fileRef = v.getAbstractFileByPath(this.filepath) as TFile;
		if( !(this.fileRef instanceof TFile) ) {
			this.root.render(
				<div>
					<p>Handwriting ink file not found</p>
				</div>
			);
			return;
		}

		const fileContents = await v.cachedRead(this.fileRef as TFile);	// REVIEW: This shouldn't be cached read
		const pageData = JSON.parse(fileContents) as PageData;

		this.root = createRoot(this.el);
		this.root.render(
            <HandwrittenEmbed
                existingData = {pageData.tldraw}
                uid = {this.fileRef.path}
                save = {this.saveLinkedFile}
			/>
        );
	}

	async onunload() {
		this.root.unmount();
	}

	// Helper functions
	///////////////////

	saveLinkedFile = async (tldrawData: SerializedStore<TLRecord>) => {
		if(!this.fileRef) return;
		const fileContents = buildPageFile(tldrawData);
		await this.plugin.app.vault.modify(this.fileRef, fileContents);
		console.log('...Saved');
	}

}