import { Editor, Store, StoreSnapshot, TLGeoShape, TLRecord, TLShapePartial, Tldraw, createShapeId, createTLStore, parseTldrawJsonFile } from "@tldraw/tldraw";
// import { getAssetUrlsByMetaUrl } from '@tldraw/assets/urls';
import { MarkdownRenderChild, MarkdownViewModeType, Plugin, TFile, } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";



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
	viewMode: MarkdownViewModeType;
	root: Root;

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


	async onload() {
		const v = this.plugin.app.vault;
		const fileRef = v.getAbstractFileByPath(this.sourcePath)
		if( !(fileRef instanceof TFile) ) {
			console.error(`File not found.`);
			return;
		}
		const sourceJson = await v.cachedRead(fileRef as TFile);

		const rootEl = this.el.createEl("div");
		this.root = createRoot(rootEl);
		this.root.render(
			<ReactApp
				sourceJson = {sourceJson}
			/>
		);
		this.el.children[0].replaceWith(rootEl);
	}

	async onunload() {
		this.root.unmount();
	}

}


const ReactApp = (props: {sourceJson: string}) => {
	// const assetUrls = getAssetUrlsByMetaUrl();

	const handleMount = (editor: Editor) => {
		editor.zoomToFit()
		editor.updateInstanceState({
			isReadonly: true,
			canMoveCamera: false,
			isToolLocked: true,
			isDebugMode: false,
		})
	}

	return <>
		<div
			className = 'block-widget external-styling'
			style = {{
				height: '500px'
			}}
		>
			<Tldraw
				snapshot = {JSON.parse(props.sourceJson)}
				hideUi = {true}
				onMount = {handleMount}
				// assetUrls = {assetUrls}
			/>
		</div>
	</>;
	
};