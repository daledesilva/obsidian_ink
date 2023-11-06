import {
	Extension,
	StateEffect,
	StateField,
 } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	keymap,
} from "@codemirror/view";






// Mark decoration based on keyboard shortcut
// ie. It will appear when performed but not after reopening the doc
///////////////////////////////

// Define how to remap the underline ranges when the document changes??? // REVIEW:
const addUnderlineEffect = StateEffect.define<{from: number, to: number}>({
	map: ({from, to}, change) => ({
		from: change.mapPos(from),
		to: change.mapPos(to)
	})
})

// Define the class to apply and the related styling
const underlineMark = Decoration.mark({class: "cm-underline"})
const myTheme = EditorView.baseTheme({
	".cm-underline": { textDecoration: "underline 3px red" }
})

// Define a StateField to monitor the state of all underline decorations in the set
const myStateField = StateField.define<DecorationSet>({

	// Starts with an empty DecorationSet
	create(): DecorationSet {
		return Decoration.none
	},

	update(oldState, transaction): DecorationSet {
		// This appears to make a copy of the state
		let newState = oldState.map(transaction.changes);
		
		// For all underline effects in the transaction...
		for (let effect of transaction.effects) if (effect.is(addUnderlineEffect)) {
			// Add all of them to the DecorationSet regardless of if they overlap or exist already // TODO: This could be updated with filter and other smarts
			newState = newState.update({
				add: [underlineMark.range(effect.value.from, effect.value.to)]
			})
		}

		// Return updated DecorationSet
		return newState;
	},

	// Tell the editor to use these decorations (ie. provide them from this statefield)
	provide(thisStateField): Extension {
		return EditorView.decorations.from(thisStateField);
	}
})


// REVIEW: Annotate this
export function underlineSelection(view: EditorView) {
	let effects: StateEffect<unknown>[] = view.state.selection.ranges
		.filter(r => !r.empty)
		.map(({from, to}) => addUnderlineEffect.of({from, to}))

	if (!effects.length) return false

	if (!view.state.field(myStateField, false)) {
		effects.push(StateEffect.appendConfig.of([myStateField, myTheme]))
	}
	view.dispatch({effects})
	return true
}


export const underlineKeymap = keymap.of([{
	key: "Mod-u",
	preventDefault: true,
	run: underlineSelection
}])


export function transientMarkExtension(): Extension {
	return [
	  underlineKeymap,
	]
}



