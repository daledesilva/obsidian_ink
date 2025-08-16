import InkPlugin from "src/main";
import { Editor } from "obsidian";
import { buildDrawingEmbed_v1 } from "src/components/formats/v1-code-blocks/utils/build-embeds";
import { activateNextEmbed } from "src/logic/utils/storage";
import { createNewDrawingFile_v1 } from "./create-new-drawing-file-v1";

//////////
//////////

export const insertNewDrawingFile_v1 = async (plugin: InkPlugin, editor: Editor) => {
    const activeFile = plugin.app.workspace.getActiveFile();
    const fileRef = await createNewDrawingFile_v1(plugin, activeFile);
    let embedStr = buildDrawingEmbed_v1(fileRef.path);
    
    activateNextEmbed();
    const positionForEmbed = editor.getCursor();
    editor.replaceRange( embedStr, positionForEmbed );
    const positionForCursor = {...positionForEmbed};
    
    // Move the cursor to after the embed (Doesn't do anything if the embed is activated by default)
    const embedLines = embedStr.split(/\r\n|\r|\n/);
    positionForCursor.line += embedLines.length;
    editor.setCursor(positionForCursor)
}
