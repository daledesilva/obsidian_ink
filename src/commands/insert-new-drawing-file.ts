import InkPlugin from "src/main";
import { Editor } from "obsidian";
import { buildEmbed } from "src/utils/embed";
import createNewDrawingFile from "./create-new-drawing-file";

//////////
//////////

const insertNewDrawingFile = async (plugin: InkPlugin, editor: Editor) => {
    const fileRef = await createNewDrawingFile(plugin);
    let embedStr = buildEmbed(fileRef.path);
    editor.replaceRange( embedStr, editor.getCursor() );
}

//////////

export default insertNewDrawingFile;