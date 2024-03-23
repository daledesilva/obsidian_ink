import InkPlugin from "src/main";
import createNewWritingFile from "./create-new-writing-file";
import { Editor } from "obsidian";
import { buildWritingEmbed } from "src/utils/embed";

/////////
/////////

const insertNewWritingFile = async (plugin: InkPlugin, editor: Editor) => {
    const fileRef = await createNewWritingFile(plugin);
    let embedStr = buildWritingEmbed(fileRef.path);
    editor.replaceRange( embedStr, editor.getCursor() );
}

export default insertNewWritingFile;