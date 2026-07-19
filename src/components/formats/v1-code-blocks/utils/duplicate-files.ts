import { TFile } from "obsidian";
import { createFoldersForFilepath } from "src/logic/utils/createFoldersForFilepath";
import { getNewTimestampedDrawingFilepath, getNewTimestampedWritingFilepath } from "src/logic/utils/file-manipulation";
import InkPlugin from "src/main";

///////////
///////////

// v1 duplicate: writes to .drawing

export const duplicateDrawingFile_v1 = async (plugin: InkPlugin, existingFileRef: TFile, instigatingFile?: TFile | null): Promise<TFile | null> => {
    const v = plugin.app.vault;
    const newFilePath = await getNewTimestampedDrawingFilepath(plugin, instigatingFile);
    await createFoldersForFilepath(plugin, newFilePath);
    const newFile = await v.copy(existingFileRef, newFilePath);
    return newFile;
};

export const duplicateWritingFile_v1 = async (plugin: InkPlugin, existingFileRef: TFile, instigatingFile?: TFile | null): Promise<TFile | null> => {
    const v = plugin.app.vault;

    const newFilePath = await getNewTimestampedWritingFilepath(plugin, instigatingFile);
    const newFile = await v.copy(existingFileRef, newFilePath);

    return newFile;
};
