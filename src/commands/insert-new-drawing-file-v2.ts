import InkPlugin from "src/main";
import { Editor } from "obsidian";
import { activateNextEmbed } from "src/logic/utils/storage";
import { buildDrawingEmbed_v2 } from "src/logic/utils/embed";
import createNewDrawingFile_v2 from "./create-new-drawing-file-v2";

//////////
//////////

const insertNewDrawingFile_v2 = async (plugin: InkPlugin, editor: Editor) => {
    const activeFile = plugin.app.workspace.getActiveFile();
    const fileRef = await createNewDrawingFile_v2(plugin, activeFile);
    const embedStr = buildDrawingEmbed_v2(fileRef.path);

    activateNextEmbed();
    const positionForEmbed = editor.getCursor();
    editor.replaceRange(embedStr, positionForEmbed);

    const positionForCursor = { ...positionForEmbed };
    const embedLines = embedStr.split(/\r\n|\r|\n/);
    positionForCursor.line += embedLines.length;
    editor.setCursor(positionForCursor);
};

export default insertNewDrawingFile_v2;


