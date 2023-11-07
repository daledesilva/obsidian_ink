import { Editor, Store, StoreSnapshot, TLGeoShape, TLRecord, TLShapePartial, Tldraw, createShapeId, createTLStore, parseTldrawJsonFile } from "@tldraw/tldraw";
import { MarkdownRenderChild, MarkdownViewModeType, Plugin, TFile, } from "obsidian";
import * as React from "react";
import { useState } from "react";
import { Root, createRoot } from "react-dom/client";



// Import scss file so that compiler adds it.
// This is instead of injecting it using EditorView.baseTheme
// This allow syou to write scss in an external file and have it refresh during dev better.
// import './block-widget.scss';


export function registerHandwritingEmbed(plugin: Plugin) {
	console.log('Registering handwriting embed');
	plugin.registerMarkdownCodeBlockProcessor(
		'handwriting-embed',
		(source, el, ctx) => {
			const sourcePath = source.trim();
			// console.log('source', source);
			// console.log('el', el);
			// console.log('ctx', ctx);

			// TODO: How best to get the view mode?

			// const view = plugin.app.workspace.());
			// console.log('view', view);
    		// const viewMode = view.getMarkdownView().getViewMode();
			// console.log('viewMode', viewMode);
			// console.log('this', this);
			// const viewMode = this.getViewMode(el);
			// console.log('viewMode', viewMode);
			// if (viewMode) {
				// ctx.addChild(new MyWidget(el, this, sourcePath, viewMode));
				ctx.addChild(new HandwritingEmbedWidget(el, this, sourcePath));
			// }

		}
	);
	console.log('Finished Registering--------');
}

// REVIEW: Don't think this counts as a decoration? Might need to be in a different folder

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
		// viewMode: MarkdownViewModeType
	) {
		super(el);
		this.el = el;
		this.plugin = plugin;
		this.sourcePath = sourcePath;
		// this.viewMode = viewMode;
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
			// <Provider store={store}>
				<ReactApp
					// plugin={this.plugin}
					sourceJson = {sourceJson}
					// viewMode={this.viewMode}
				/>
			// </Provider>
		);
		this.el.children[0].replaceWith(rootEl);
	}

	async onunload() {
		this.root.unmount();
	}

}





const ReactApp = (props: {sourceJson: string}) => {
	// const [title, setTitle] = useState('React Based Block Widget');


	const handleMount = (editor: Editor) => {

		// createTLStore({
		// 	initialData: JSON.parse(props.sourceJson)
		// })
		// editor.store.loadSnapshot(JSON.parse(props.sourceJson))

		// Zoom the camera to fit both shapes
		// editor.zoomToFit()


		editor.updateInstanceState({
			// isReadonly: true,
			// canMoveCamera: false,
			// isToolLocked: true,
			// isDebugMode: false,
		})
	}




	return <>
		<div
			className = 'block-widget external-styling'
			style = {{
			// position: 'fixed',
			// inset: 0
			height: '500px'
		}}>
			<Tldraw
				snapshot = {JSON.parse(props.sourceJson)}
				// hideUi = {true}
				onMount = {handleMount}
			/>
		</div>
	</>;
};