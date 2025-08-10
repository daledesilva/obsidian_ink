import InkPlugin from 'src/main';
import { Editor } from 'obsidian';
import createNewWritingFile from './create-new-writing-file';
import { activateNextEmbed } from 'src/logic/utils/storage';
import { buildWritingEmbedV2 } from 'src/logic/utils/embed';

const insertNewWritingFileV2 = async (plugin: InkPlugin, editor: Editor) => {
    const activeFile = plugin.app.workspace.getActiveFile();
    const fileRef = await createNewWritingFile(plugin, activeFile);
    const embedStr = buildWritingEmbedV2(fileRef.path);

    activateNextEmbed();
    const positionForEmbed = editor.getCursor();
    editor.replaceRange(embedStr, positionForEmbed);

    const positionForCursor = { ...positionForEmbed };
    const embedLines = embedStr.split(/\r\n|\r|\n/);
    positionForCursor.line += embedLines.length;
    editor.setCursor(positionForCursor);
};

export default insertNewWritingFileV2;


