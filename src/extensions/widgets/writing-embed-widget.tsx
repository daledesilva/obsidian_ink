import './writing-embed-widget.scss';
import { MarkdownRenderChild, TFile } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { InkFileData, stringifyPageData } from "src/utils/page-file";
import { WritingEmbedData as WritingEmbedData } from "src/utils/embed";
import InkPlugin from "src/main";
import WritingEmbed from "src/tldraw/writing/writing-embed";
import { PLUGIN_KEY, WRITE_EMBED_KEY, WRITE_FILE_EXT } from "src/constants";
import { Provider } from "react-redux";
import { store } from "src/logic/stores";
import {
	syntaxTree
} from "@codemirror/language";
import {
	Extension,
	RangeSetBuilder,
	Prec
} from "@codemirror/state";
import {
	Decoration,
	ViewPlugin,
	DecorationSet,
	ViewUpdate,
	PluginSpec,
	PluginValue,
	WidgetType,
	EditorView,
} from "@codemirror/view";

////////
////////


export function registerWritingEmbed(plugin: InkPlugin) {

	const pluginSpec: PluginSpec<WritingWidgetDecorations> = {
		decorations: (value: WritingWidgetDecorations) => value.decorations,
	};
	
	class WritingWidgetDecorations implements PluginValue {
		decorations: DecorationSet;
	
		constructor(view: EditorView) {
			this.buildDecorations(view);
		}
		
		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged) {
				this.buildDecorations(update.view);
			}
		}
	
		destroy() { }
	
		async buildDecorations(view: EditorView) {
			const builder = new RangeSetBuilder<Decoration>();
			const doc = view.state.doc;
			// console.log('doc', doc);

			// if(doc.length > 3) {
				
			// 	const from = doc.line(3).from;
			// 	const to = doc.line(3).to;
	
			// 	builder.add(
			// 		from,
			// 		to,
			// 		Decoration.replace({
			// 			widget: new EmbedWidget(),
			// 			// block: true
			// 		})
			// 	);
	
			// 	console.log('from', from);
			// 	console.log('to', to);
			// };

			// this.decorations = builder.finish();




			// const linesIter = view.state.doc.iterLines();
			// for (const line of linesIter) {
			// 	console.log(line); // Prints each line without line breaks
			// 	console.log('linesIter', linesIter)
			// }

			// TODO: Shouldn't be doing hte whole doc, use visible ranges
			const wholeDocStr = view.state.doc.sliceString(0);
			console.log('wholeDocStr:', wholeDocStr);

			let embeds = getEmbeds(wholeDocStr) ;

			embeds?.forEach( (embed) => {
				// Add to line before test
				// TODO: Check these values
				builder.add(
					embed.outerIndex-1,
					embed.outerIndex-1,
					Decoration.widget({
						widget: new EmbedWidget(),
					})
				);
				// Hide actual line
				// TODO: This still appears when clicked because of Obsidian's code appearance on cursor
				builder.add(
					embed.outerIndex,
					embed.outerIndex + embed.outerLength,
					Decoration.replace({
						widget: new EmptyWidget(),
					})
				);
			})
			
			this.decorations = builder.finish();
			
			

			
			

			

			// for (let { from, to } of view.visibleRanges) {
				
				// const range = view.state.doc.sliceString(from, to);
				// let embeds = getEmbeds(range) ;
				// console.log('-------------');
				// console.log('range', range);
				// console.log('embeds:', embeds)

				

				// console.log('line', line);
				// let line = view.state.doc.lineAt(from);
				// let embedStr = getEmbeds(line.text);
				// if(!embedStr) continue;
	
				// // Split by Pipe and get first item
				// const filename = getFilenameInEmbed(embedStr);
				// if(!filename) continue;
	
				
				// // TODO: How do I get the plugin or vault?
				// const writingFile = getWritingFile(plugin, filename);
				// if(!writingFile) {
				// 	console.log('-------- NO WRITING FILE FOUND!!!');
				// 	continue;
				// }
	
				
	
				// const v = plugin.app.vault;
				// const pageDataStr = await v.read(writingFile as TFile);
				// const pageData = JSON.parse(pageDataStr) as InkFileData;

				// console.log('line', line);

				// builder.add(
				// 	line.from,
				// 	line.to,
				// 	Decoration.replace({
				// 		widget: new EmbedWidget(),
				// 	})
				// );
			
				// this.root = createRoot(this.el);
				// this.root.render(
				// 	<Provider store={store}>
				// 		<WritingEmbed
				// 			plugin={this.plugin}
				// 			fileRef={this.fileRef}
				// 			pageData={pageData}
				// 			save={this.save}
				// 		/>
				// 	</Provider>
				// );
	
	
	
				// let content = line.text;
				// let words = content.split(' ');
				// for (let i = 0; i < words.length; i++) {
				// 	if (words[i] == 'emoji') {
				// 		words[i]
				// 	}
				// }
	
	
				// Iterate through doc node by node covering both outer nodes and inner nodes.
				// Plain text over multiple lines counts as 1 node.
				// syntaxTree(view.state).iterate({
				// 	from,
				// 	to,
				// 	enter(node) {
				// 		const textNode = view.state.doc.slice(node.from, node.to);
				// 		const textStr = view.state.doc.sliceString(node.from, node.to);
	
				// 		// Find a string and replace it with a widget
				// 		let startPos = 0;
				// 		let daleIndex = textStr.indexOf('Dale', startPos);
				// 		while (daleIndex >= 0) {
				// 			const docDaleIndex = node.from + daleIndex;
	
				// 			builder.add(
				// 				docDaleIndex,
				// 				docDaleIndex + 4,
				// 				Decoration.replace({
				// 					widget: new EmbedWidget(),
				// 				})
				// 			);
	
				// 			startPos = daleIndex + 4;
				// 			daleIndex = textStr.indexOf('Dale', startPos);
				// 		}
	
	
				// 		// TODO: Does an example with the below
	
				// 		// if (node.type.name.startsWith("list")) {
				// 		// 	// Position of the '-' or the '*'.
				// 		// 	const listCharFrom = node.from - 2;
	
				// 		// 	builder.add(
				// 		// 		listCharFrom,
				// 		// 		listCharFrom + 1,
				// 		// 		Decoration.replace({
				// 		// 			widget: new EmbedWidget(),
				// 		// 		})
				// 		// 	);
				// 		// }
				// 	},
				// });
			// }
	
			// this.decorations = builder.finish();
		}
	}


	const myCodeMirrorPlugin = ViewPlugin.fromClass(WritingWidgetDecorations, pluginSpec);
	// Set precedence to high or highest to run this extension before Obsidian's handling of <tags>
	plugin.registerEditorExtension( Prec.highest(myCodeMirrorPlugin) );
	// plugin.registerEditorExtension( myCodeMirrorPlugin );
}



export class EmbedWidget extends WidgetType {
	toDOM(view: EditorView): HTMLElement {
		// TODO: Prevent backspacing ot deleting to delete part of this, It should delete the whole thing (Possibly select the whole thing first).
		const span = document.createElement("span");
		span.classList.add('test-widget')
		span.innerText = "Test Widget";
		return span;
	}
}

export class EmptyWidget extends WidgetType {
	toDOM(view: EditorView): HTMLElement {
		// TODO: Prevent the cursor from entering this (actually, this whole line).
		const span = document.createElement("span");
		// span.innerText = "EMPTY";
		// span.innerText = "";
		return span;
	}
}





interface embedSearchResult {
	innerStr: string,
	outerIndex: number,
	outerLength: number,
};


function getEmbeds(str: string): embedSearchResult[] | null {
	const results: embedSearchResult[] = [];
	
	// "![[*]]"
	const regex = /!\[\[(.*?)\]\]/g;
	// const regex = /<ink>(.*?)<\/ink>/g
	// const regex = /<<ink>>(.*?)<<\/ink>>/g
	// const regex = /<img(.*?)\/>/g
	let match: RegExpExecArray | null;
	while ((match = regex.exec(str)) !== null) {
		results.push({
			innerStr: match[1], // Captured group 1 contains the content inside the tags
			outerIndex: match.index, // Index of the entire match
			outerLength: match[0].length, // Length of the entire match
		});
	}
	
	return results ? results : null;
}

function getFilenameInEmbed(str: string): string | null {
	let filename = str.split('|')[0];
	if(!filename) return null;

	return filename.trim();
}

function getWritingFile(plugin: InkPlugin, previewFilename: string): TFile | null {
	const splitFilename = previewFilename.split('.');
	// console.log('splitFilename', splitFilename);
	if(splitFilename.length < 2)	return null;
	
	const ext = splitFilename.pop()?.toLowerCase();
	// console.log('ext', ext);
	if(ext !== 'png')	return null;
	
	const name = splitFilename.join('.');
	// console.log('name', name);
	const writingFilename = name + '.' + WRITE_FILE_EXT;
	
	const v = plugin.app.vault;
	const fileRef = v.getAbstractFileByPath(writingFilename) as TFile;
	// console.log('fileRef', fileRef);

	if (!fileRef || !(fileRef instanceof TFile))	return null;

	return fileRef;

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

		if (!this.fileRef || !(this.fileRef instanceof TFile)) {
			this.el.createEl('p').textContent = 'Ink writing file not found.';
			return;
		}

		const pageDataStr = await v.read(this.fileRef as TFile);
		const pageData = JSON.parse(pageDataStr) as InkFileData;

		this.root = createRoot(this.el);
		this.root.render(
			<Provider store={store}>
				<WritingEmbed
					plugin={this.plugin}
					fileRef={this.fileRef}
					pageData={pageData}
					save={this.save}
				/>
			</Provider>
		);
	}

	async onunload() {
		this.root.unmount();
	}

	// Helper functions
	///////////////////

	save = async (pageData: InkFileData) => {
		if (!this.fileRef) return;
		const pageDataStr = stringifyPageData(pageData);
		await this.plugin.app.vault.modify(this.fileRef, pageDataStr);
	}

}