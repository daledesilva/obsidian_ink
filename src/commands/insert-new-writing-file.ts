import InkPlugin from "src/main";
import createNewWritingFile from "./create-new-writing-file";
import { Editor } from "obsidian";
import { buildWritingEmbed } from "src/utils/embed";
import { activateNextEmbed } from "src/utils/storage";

/////////
/////////

const insertNewWritingFile = async (plugin: InkPlugin, editor: Editor) => {
    const activeFile = plugin.app.workspace.getActiveFile();
    const fileRef = await createNewWritingFile(plugin, activeFile);
    let embedStr = buildWritingEmbed(fileRef.path);
    activateNextEmbed();
    editor.replaceRange( embedStr, editor.getCursor() );
}

export default insertNewWritingFile;