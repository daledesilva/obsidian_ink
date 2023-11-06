import {
	syntaxTree
} from "@codemirror/language";
import {
	Facet,
	Extension,
	RangeSetBuilder,
	StateEffect,
	StateField,
	Transaction,
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








const baseTheme = EditorView.baseTheme({
  ".cm-zebraStripe": {backgroundColor: "#444"}
//   "&light .cm-zebraStripe": {backgroundColor: "#d4fafa"},
//   "&dark .cm-zebraStripe": {backgroundColor: "#1a2727"}
})


const stepSize = Facet.define<number, number>({
  combine: values => values.length ? Math.min(...values) : 2
})





// View Plugin
// This only allows styling the view area of the document.


const stripe = Decoration.line({
  attributes: {class: "cm-zebraStripe"}
})

function stripeDeco(view: EditorView) {
  let step = view.state.facet(stepSize)
  let builder = new RangeSetBuilder<Decoration>()

  for (let {from, to} of view.visibleRanges) {

    for (let pos = from; pos <= to;) {

      let line = view.state.doc.lineAt(pos)
	  
	
      if ((line.number % step) == 0) {
		  builder.add(line.from, line.from, stripe)
	  }
      pos = line.to + 1

	}
  }
  return builder.finish()
}


class ExamplePlugin implements PluginValue {
	decorations: DecorationSet

	constructor(view: EditorView) {
		this.decorations = stripeDeco(view)
	}

	update(update: ViewUpdate) {
		if (update.docChanged || update.viewportChanged) {
			this.decorations = stripeDeco(update.view)
			console.log('update');
		}
	}

	destroy() {

	}
}

const showStripes = ViewPlugin.fromClass(ExamplePlugin, {
	decorations: v => v.decorations
})


export function lineExtension(): Extension {
	return [
	  baseTheme, // Not needed if I use a css file
	  showStripes,
	]
  }