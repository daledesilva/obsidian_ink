import InkPlugin from "src/main";
import { createNewWritingFile_v1 } from "./create-new-writing-file-v1";
import { Editor } from "obsidian";
import { buildWritingEmbed_v1 } from "src/components/formats/v1-code-blocks/utils/build-embeds";
import { activateNextEmbed } from "src/logic/utils/storage";

/////////
/////////

export const insertNewWritingFile_v1 = async (plugin: InkPlugin, editor: Editor) => {
    const activeFile = plugin.app.workspace.getActiveFile();
    const fileRef = await createNewWritingFile_v1(plugin, activeFile);
    let embedStr = buildWritingEmbed_v1(fileRef.path);
    
    activateNextEmbed();
    const positionForEmbed = editor.getCursor();
    editor.replaceRange( embedStr, positionForEmbed );
    const positionForCursor = {...positionForEmbed};
    
    // Move the cursor to after the embed (Doesn't do anything if the embed is activated by default)
    const embedLines = embedStr.split(/\r\n|\r|\n/);
    positionForCursor.line += embedLines.length;
    editor.setCursor(positionForCursor)
}
