import InkPlugin from 'src/main';
import { Editor } from 'obsidian';
import { activateNextEmbed } from 'src/logic/utils/storage';
import { buildWritingEmbed_v2 } from 'src/logic/utils/embed';
import createNewWritingFile_v2 from './create-new-writing-file-v2';

const insertNewWritingFileV2 = async (plugin: InkPlugin, editor: Editor) => {
    const activeFile = plugin.app.workspace.getActiveFile();
    const fileRef = await createNewWritingFile_v2(plugin, activeFile);
    const embedStr = buildWritingEmbed_v2(fileRef.path);

    activateNextEmbed();
    const positionForEmbed = editor.getCursor();
    editor.replaceRange(embedStr, positionForEmbed);

    const positionForCursor = { ...positionForEmbed };
    const embedLines = embedStr.split(/\r\n|\r|\n/);
    positionForCursor.line += embedLines.length;
    editor.setCursor(positionForCursor);
};

export default insertNewWritingFileV2;


