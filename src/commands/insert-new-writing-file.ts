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
    const positionForEmbed = editor.getCursor();
    editor.replaceRange( embedStr, positionForEmbed );
    const positionForCursor = {...positionForEmbed};
    
    // Move the cursor to after the embed (Doesn't do anything if the embed is activated by default)
    const embedLines = embedStr.split(/\r\n|\r|\n/);
    positionForCursor.line += embedLines.length;
    editor.setCursor(positionForCursor)
}

export default insertNewWritingFile;