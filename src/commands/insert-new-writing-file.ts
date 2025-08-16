import InkPlugin from 'src/main';
import { Editor } from 'obsidian';
import { activateNextEmbed } from 'src/logic/utils/storage';
import { buildWritingEmbed } from "src/components/formats/current/utils/build-embeds";
import { createNewWritingFile } from './create-new-writing-file';

export const insertNewWritingFile = async (plugin: InkPlugin, editor: Editor) => {
    const activeFile = plugin.app.workspace.getActiveFile();
    const fileRef = await createNewWritingFile(plugin, activeFile);
    const embedStr = buildWritingEmbed(fileRef.path);

    activateNextEmbed();
    const positionForEmbed = editor.getCursor();
    editor.replaceRange(embedStr, positionForEmbed);

    const positionForCursor = { ...positionForEmbed };
    const embedLines = embedStr.split(/\r\n|\r|\n/);
    positionForCursor.line += embedLines.length;
    editor.setCursor(positionForCursor);
};


