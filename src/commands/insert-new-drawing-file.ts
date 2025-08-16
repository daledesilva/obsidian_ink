import InkPlugin from "src/main";
import { Editor } from "obsidian";
import { activateNextEmbed } from "src/logic/utils/storage";
import { buildDrawingEmbed } from "src/components/formats/current/utils/build-embeds";
import { createNewDrawingFile } from "./create-new-drawing-file";

//////////
//////////

export const insertNewDrawingFile = async (plugin: InkPlugin, editor: Editor) => {
    const activeFile = plugin.app.workspace.getActiveFile();
    const fileRef = await createNewDrawingFile(plugin, activeFile);
    const embedStr = buildDrawingEmbed(fileRef.path);

    activateNextEmbed();
    const positionForEmbed = editor.getCursor();
    editor.replaceRange(embedStr, positionForEmbed);

    const positionForCursor = { ...positionForEmbed };
    const embedLines = embedStr.split(/\r\n|\r|\n/);
    positionForCursor.line += embedLines.length;
    editor.setCursor(positionForCursor);
};



