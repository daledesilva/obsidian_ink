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
    const positionForEmbed = editor.getCursor();
    editor.replaceRange( embedStr, positionForEmbed );
    const positionForCursor = {...positionForEmbed};
    
    // Move the cursor to after the embed (Doesn't do anything if the embed is activated by default)
    const embedLines = embedStr.split(/\r\n|\r|\n/);
    positionForCursor.line += embedLines.length;
    editor.setCursor(positionForCursor)
}

export default insertNewDrawingFile;