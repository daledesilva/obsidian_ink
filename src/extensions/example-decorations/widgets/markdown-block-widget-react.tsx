import {
	Editor,
	MarkdownRenderChild,
	MarkdownViewModeType,
	Plugin,
} from "obsidian";
import {
	Extension,
	StateField,
 } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	WidgetType,
} from "@codemirror/view";
import * as React from "react";
import * as ReactDom from "react-dom";
import { createRoot, Root } from "react-dom/client";
import { BlockWidgetReactApp } from './block-widget-react-app';


// Import scss file so that compiler adds it.
// This is instead of injecting it using EditorView.baseTheme
// This allow syou to write scss in an external file and have it refresh during dev better.
import './block-widget.scss';


export function registerMarkdownBlockWidget(plugin: Plugin) {
	console.log('Registering--------');
	plugin.registerMarkdownCodeBlockProcessor(
		'block-widget-dale',
		(source, el, ctx) => {
			const rawContent = source.trim();
			console.log('source', source);
			console.log('el', el);
			console.log('ctx', ctx);

			// TODO: How best to get the view mode?

			// const view = plugin.app.workspace.());
			// console.log('view', view);
    		// const viewMode = view.getMarkdownView().getViewMode();
			// console.log('viewMode', viewMode);
			// console.log('this', this);
			// const viewMode = this.getViewMode(el);
			// console.log('viewMode', viewMode);
			// if (viewMode) {
				// ctx.addChild(new MyWidget(el, this, rawContent, viewMode));
				ctx.addChild(new MyWidget(el, this, rawContent));
			// }
		}
	);
	console.log('Finished Registering--------');
}

// REVIEW: Don't think this counts as a decoration? Might need to be in a different folder

class MyWidget extends MarkdownRenderChild {
	el: HTMLElement;
	plugin: Plugin;
	rawContent: string;
	viewMode: MarkdownViewModeType;
	root: Root;

	constructor(
		el: HTMLElement,
		plugin: Plugin,
		tableId: string,
		// viewMode: MarkdownViewModeType
	) {
		super(el);
		this.el = el;
		this.plugin = plugin;
		this.rawContent = tableId;
		// this.viewMode = viewMode;
	}


	async onload() {
		const rootEl = this.el.createEl("div");
		this.root = createRoot(rootEl);
		this.root.render(
			// <Provider store={store}>
				<BlockWidgetReactApp
					// plugin={this.plugin}
					// tableId={this.tableId}
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





// private getViewMode = (el: HTMLElement): MarkdownViewModeType | null => {
// 	const parent = el.parentElement;
// 	if (parent) {
// 		return parent.className.includes("cm-preview-code-block")
// 			? "source"
// 			: "preview";
// 	}
// 	return null;
// };