import InkPlugin from "src/main";
import { Editor } from "obsidian";
import { buildDrawingEmbed } from "src/utils/embed";
import createNewDrawingFile from "./create-new-drawing-file";
import { activateNextEmbed } from "src/utils/storage";

//////////
//////////

const insertNewDrawingFile = async (plugin: InkPlugin, editor: Editor) => {
    const activeFile = plugin.app.workspace.getActiveFile();
    const fileRef = await createNewDrawingFile(plugin, activeFile);
    let embedStr = buildDrawingEmbed(fileRef.path);
    activateNextEmbed();
    editor.replaceRange( embedStr, editor.getCursor() );
}

export default insertNewDrawingFile;