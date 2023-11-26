import { Editor, SerializedStore, Store, StoreSnapshot, TLGeoShape, TLRecord, TLShapePartial, Tldraw, createShapeId, createTLStore, parseTldrawJsonFile } from "@tldraw/tldraw";
// import { getAssetUrlsByMetaUrl } from '@tldraw/assets/urls';
import { MarkdownRenderChild, MarkdownViewModeType, Plugin, TAbstractFile, TFile, debounce, } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { PageData, buildPageFile } from "src/utils/page-file";
import TldrawEmbedEditor from "src/tldraw/tldraw-embed-editor";



// Import scss file so that compiler adds it.
// This is instead of injecting it using EditorView.baseTheme
// This allow syou to write scss in an external file and have it refresh during dev better.
import './handwriting-embed.scss';


export function registerHandwritingEmbed(plugin: Plugin) {
	plugin.registerMarkdownCodeBlockProcessor(
		'handwriting-embed',
		(source, el, ctx) => {
			const sourcePath = source.trim();
			if(sourcePath) {
				ctx.addChild(new HandwritingEmbedWidget(el, plugin, sourcePath));
			}
		}
	);
}

class HandwritingEmbedWidget extends MarkdownRenderChild {
	el: HTMLElement;
	plugin: Plugin;
	sourcePath: string;
	root: Root;
	fileRef: TFile | null;
	debouncedSaveEmbeddedFile = debounce(this.saveEmbeddedFile, 1000, true)

	constructor(
		el: HTMLElement,
		plugin: Plugin,
		sourcePath: string,
	) {
		super(el);
		this.el = el;
		this.plugin = plugin;
		this.sourcePath = sourcePath;
	}


	buildPageAndSave = (tldrawData: SerializedStore<TLRecord>) => {
		this.debouncedSaveEmbeddedFile(tldrawData);
    }


	async onload() {
		const v = this.plugin.app.vault;
		this.fileRef = v.getAbstractFileByPath(this.sourcePath) as TFile;
		if( !(this.fileRef instanceof TFile) ) {
			console.error(`File not found.`);
			return;
		}
		const fileContents = await v.cachedRead(this.fileRef as TFile);
		const pageData = JSON.parse(fileContents) as PageData;

		this.root = createRoot(this.el);
		this.root.render(
            <TldrawEmbedEditor
                existingData = {pageData.tldraw}
                uid = {this.fileRef.path}
                save = {this.buildPageAndSave}
			/>
        );
	}

	async onunload() {
		this.root.unmount();
	}

	// Helper functions
	///////////////////

	saveEmbeddedFile(tldrawData: SerializedStore<TLRecord>) {
		if(!this.fileRef) return;
		console.log('saving!!!');
		const fileContents = buildPageFile(tldrawData);
		this.plugin.app.vault.modify(this.fileRef, fileContents);
	}

}