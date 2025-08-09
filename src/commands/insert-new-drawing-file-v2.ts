import InkPlugin from "src/main";
import { Editor } from "obsidian";
import createNewDrawingFile from "./create-new-drawing-file";
import { activateNextEmbed } from "src/logic/utils/storage";
import { buildDrawingEmbedV2 } from "src/logic/utils/embed";

//////////
//////////

const insertNewDrawingFileV2 = async (plugin: InkPlugin, editor: Editor) => {
    const activeFile = plugin.app.workspace.getActiveFile();
    const fileRef = await createNewDrawingFile(plugin, activeFile);
    const embedStr = buildDrawingEmbedV2(fileRef.path);

    activateNextEmbed();
    const positionForEmbed = editor.getCursor();
    editor.replaceRange(embedStr, positionForEmbed);

    const positionForCursor = { ...positionForEmbed };
    const embedLines = embedStr.split(/\r\n|\r|\n/);
    positionForCursor.line += embedLines.length;
    editor.setCursor(positionForCursor);
};

export default insertNewDrawingFileV2;


