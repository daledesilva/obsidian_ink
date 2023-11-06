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










const highlightTheme = EditorView.baseTheme({
	".my-mark": {
		padding: "0.3em 0.45em",
		backgroundColor: "yellow",
		color: "black",
	}
})





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
					let strIndex = textStr.indexOf('mark', startPos);
					while(strIndex >= 0) {
						const docStringIndex = node.from + strIndex;
						
						builder.add(
							docStringIndex,
							docStringIndex + 4,
							Decoration.mark({
								class: 'my-mark',
							})
						);

						startPos = strIndex + 4;
						strIndex = textStr.indexOf('mark', startPos);
					}

					
				},
			});
		}
  
	  return builder.finish();
	}
  }
  
  const pluginSpec: PluginSpec<MyCodeMirrorPlugin> = {
	decorations: (value: MyCodeMirrorPlugin) => value.decorations,
  };
  
  const myCodeMirrorPlugin = ViewPlugin.fromClass( MyCodeMirrorPlugin, pluginSpec );


  export function persistentMarkExtension(): Extension {
	return [
	  myCodeMirrorPlugin,
	  highlightTheme,
	]
}