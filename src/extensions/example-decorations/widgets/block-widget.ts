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

// Import scss file so that compiler adds it.
// This is instead of injecting it using EditorView.baseTheme
// This allow syou to write scss in an external file and have it refresh during dev better.
import './block-widget.scss';



export class MyWidget extends WidgetType {
	toDOM(view: EditorView): HTMLElement {
		const blockDiv = document.createElement('div');
		blockDiv.addClass('block-widget');
		blockDiv.addClass('external-styling');
		blockDiv.createEl('h2').innerText = 'Block Widget';
		blockDiv.createEl('p').innerText = 'This is a block widget placed in a static position at the top of the document.';
		return blockDiv;
	}
}
const myWidget = Decoration.widget({widget: new MyWidget()});


// Define a StateField to monitor the state of all underline decorations in the set
const myStateField = StateField.define<DecorationSet>({

	// Starts with an empty DecorationSet
	create(): DecorationSet {
		let set = Decoration.none;
		set = set.update({
			add: [myWidget.range(0)]
		})
		return set;
	},
	
	update(oldState, transaction): DecorationSet {
		// No updates needed
		return oldState;
	},

	// Tell the editor to use these decorations (ie. provide them from this statefield)
	provide(thisStateField): Extension {
		return EditorView.decorations.from(thisStateField);
	}
})



export function blockWidgetExtension(): Extension {
	return [
		myStateField,
	]
}


