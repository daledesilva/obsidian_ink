import HandwritePlugin from "src/main";
import createNewHandwrittenNote from "./create-new-handwritten-note";
import { Editor } from "obsidian";



const insertNewHandwrittenNote = async (plugin: HandwritePlugin, editor: Editor) => {
    const fileRef = await createNewHandwrittenNote(plugin);

    let embedStr = "";
    embedStr += "\n```handwriting-embed";
    embedStr += "\n" + fileRef.path;
    embedStr += "\n```";

    editor.replaceRange( embedStr, editor.getCursor() );
}

// cursive
// ink
// scribe


// sketch
// drawing
// 

// ink

// handwritten
// handdrawn

// writing
// drawing


export default insertNewHandwrittenNote;