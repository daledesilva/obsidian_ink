import {
	syntaxTree
} from "@codemirror/language";
import {
	Extension,
	RangeSetBuilder,
 } from "@codemirror/state";
import {
	Decoration,
	ViewPlugin,
	DecorationSet,
	ViewUpdate,
	PluginValue,
	WidgetType,
	EditorView,
} from "@codemirror/view";


import {keymap} from "@codemirror/view";










// TODO: Update this to be a component that can accept content inside it (ie. find <button> and </button>, replace the whole range with an actual html button and copy in the inside text. )
// For settings, see https://codemirror.net/docs/ref/#view.Decoration%5Ereplace



export class MyWidget extends WidgetType {
	toDOM(view: EditorView): HTMLElement {
		const div = document.createElement("span");
		div.innerText = "👉";
		return div;
	}
}





class MyCodeMirrorPlugin implements PluginValue {
	decorations: DecorationSet;
  
	constructor(view: EditorView) {
	  this.decorations = this.buildDecorations(view);
	}
  
	update(update: ViewUpdate) {
	  if (update.docChanged || update.viewportChanged) {
		this.decorations = this.buildDecorations(update.view);
	  }
	}
  
	destroy() {}
  
	buildDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();


	
		for (let { from, to } of view.visibleRanges) {

			let line = view.state.doc.lineAt(from);
			let content = line.text;
			let words = content.split(' ');
			for(let i=0; i<words.length; i++) {
				if(words[i] == 'emoji') {
					words[i]
				}
			}


			// Iterate through doc node by node covering both outer nodes and inner nodes.
			// Plain text over multiple lines counts as 1 node.
			syntaxTree(view.state).iterate({
				from,
				to,
				enter(node) {
					const textNode = view.state.doc.slice(node.from, node.to);
					const textStr = view.state.doc.sliceString(node.from, node.to);

					// Find a string and replace it with a widget
					let startPos = 0;
					let daleIndex = textStr.indexOf('Dale', startPos);
					while(daleIndex >= 0) {
						const docDaleIndex = node.from + daleIndex;
						
						builder.add(
							docDaleIndex,
							docDaleIndex + 4,
							Decoration.replace({
								widget: new MyWidget(),
							})
						);

						startPos = daleIndex + 4;
						daleIndex = textStr.indexOf('Dale', startPos);
					}


					// TODO: Does an example with the below
					
					// if (node.type.name.startsWith("list")) {
					// 	// Position of the '-' or the '*'.
					// 	const listCharFrom = node.from - 2;

					// 	builder.add(
					// 		listCharFrom,
					// 		listCharFrom + 1,
					// 		Decoration.replace({
					// 			widget: new MyWidget(),
					// 		})
					// 	);
					// }
				},
			});
		}
  
	  return builder.finish();
	}
  }
  
  // TODO: This is needed, but I don't know why - and I don't know why it's giving an error
  const pluginSpec: PluginSpec<MyCodeMirrorPlugin> = {
	decorations: (value: MyCodeMirrorPlugin) => value.decorations,
  };
  
  const myCodeMirrorPlugin = ViewPlugin.fromClass( MyCodeMirrorPlugin, pluginSpec );


  export function replacingWidgetExtension(): Extension {
	return [
	  myCodeMirrorPlugin,
	]
}


// TODO: Consider how best to use an atomic range here
// https://codemirror.net/examples/decoration/