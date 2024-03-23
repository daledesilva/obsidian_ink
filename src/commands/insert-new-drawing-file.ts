import InkPlugin from "src/main";
import { Editor } from "obsidian";
import { buildDrawingEmbed } from "src/utils/embed";
import createNewDrawingFile from "./create-new-drawing-file";

//////////
//////////

const insertNewDrawingFile = async (plugin: InkPlugin, editor: Editor) => {
    const fileRef = await createNewDrawingFile(plugin);
    let embedStr = buildDrawingEmbed(fileRef.path);
    editor.replaceRange( embedStr, editor.getCursor() );
}

export default insertNewDrawingFile;