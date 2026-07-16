import InkPlugin from 'src/main';
import { Editor } from 'obsidian';
import { activateNextEmbed, recordRecentFileSelection } from 'src/logic/utils/storage';
import { buildWritingEmbed } from "src/components/formats/current/utils/build-embeds";
import { createNewWritingFile } from './create-new-writing-file';
import { readWritingFileAspectRatio } from 'src/logic/utils/writing-embed-aspect-ratio';

export const insertNewWritingFile = async (plugin: InkPlugin, editor: Editor) => {
    const activeFile = plugin.app.workspace.getActiveFile();
    const fileRef = await createNewWritingFile(plugin, activeFile);
    recordRecentFileSelection("inkWriting", fileRef.path);
    const aspectRatio = await readWritingFileAspectRatio(plugin, fileRef);
    const embedStr = buildWritingEmbed(
        fileRef.path,
        aspectRatio != null ? { aspectRatio } : undefined,
    );

    activateNextEmbed();
    const positionForEmbed = editor.getCursor();
    editor.replaceRange(embedStr, positionForEmbed);

    const positionForCursor = { ...positionForEmbed };
    const embedLines = embedStr.split(/\r\n|\r|\n/);
    positionForCursor.line += embedLines.length;
    editor.setCursor(positionForCursor);
};


