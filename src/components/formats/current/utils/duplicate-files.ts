import { TFile } from "obsidian";
import { createFoldersForFilepath } from "src/logic/utils/createFoldersForFilepath";
import { getNewTimestampedDrawingSvgFilepath, getNewTimestampedWritingSvgFilepath } from "src/logic/utils/file-manipulation";
import InkPlugin from "src/main";

////////////
////////////

// v2 duplicate: writes to .svg

export const duplicateDrawingFile = async (plugin: InkPlugin, existingFileRef: TFile, instigatingFile?: TFile | null): Promise<TFile | null> => {
    const v = plugin.app.vault;
    const newFilePath = await getNewTimestampedDrawingSvgFilepath(plugin, instigatingFile);
    await createFoldersForFilepath(plugin, newFilePath);
    const newFile = await v.copy(existingFileRef, newFilePath);
    return newFile;
};


export const duplicateWritingFile = async (plugin: InkPlugin, existingFileRef: TFile, instigatingFile?: TFile | null): Promise<TFile | null> => {
    const v = plugin.app.vault;

    const newFilePath = await getNewTimestampedWritingSvgFilepath(plugin, instigatingFile);
    const newFile = await v.copy(existingFileRef, newFilePath);

    return newFile;
};

