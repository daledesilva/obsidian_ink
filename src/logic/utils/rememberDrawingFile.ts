import { Notice, TFile } from "obsidian";
import InkPlugin from "src/main";
import { saveLocally } from "./storage";
import { getNewTimestampedDrawingFilepath, getNewTimestampedDrawingSvgFilepath, getNewTimestampedWritingFilepath } from "./file-manipulation";
import { createFoldersForFilepath } from "./createFoldersForFilepath";
import { getGlobals } from "src/stores/global-store";

////////////////////////
////////////////////////

export const rememberDrawingFile = async (existingFileRef: TFile) => {
    const v = getGlobals().plugin.app.vault;

    if (!(existingFileRef instanceof TFile)) {
        new Notice('No file found to copy');
        return;
    }

    saveLocally('rememberedDrawingFile', existingFileRef.path);
    new Notice(`Drawing file copied.\nRun 'Copied Drawing' where desired in a note.`);  // TODO: The aciton name here should be referenced to the actual action name from localisation
};

export const rememberWritingFile = async (plugin: InkPlugin, existingFileRef: TFile) => {
    const v = plugin.app.vault;

    if (!(existingFileRef instanceof TFile)) {
        new Notice('No file found to copy');
        return null;
    }

    saveLocally('rememberedWritingFile', existingFileRef.path);
    new Notice(`Writing file copied.\nRun 'Copied Writing Section' where desired in a note.`);  // TODO: The aciton name here should be referenced to the actual action name from localisation
};

// v1 duplicate: writes to .drawing
export const duplicateDrawingFile = async (plugin: InkPlugin, existingFileRef: TFile, instigatingFile?: TFile | null): Promise<TFile | null> => {
    const v = plugin.app.vault;
    const newFilePath = await getNewTimestampedDrawingFilepath(plugin, instigatingFile);
    await createFoldersForFilepath(plugin, newFilePath);
    const newFile = await v.copy(existingFileRef, newFilePath);
    return newFile;
};

// v2 duplicate: writes to .svg
export const duplicateDrawingFileV2 = async (plugin: InkPlugin, existingFileRef: TFile, instigatingFile?: TFile | null): Promise<TFile | null> => {
    const v = plugin.app.vault;
    const newFilePath = await getNewTimestampedDrawingSvgFilepath(plugin, instigatingFile);
    await createFoldersForFilepath(plugin, newFilePath);
    const newFile = await v.copy(existingFileRef, newFilePath);
    return newFile;
};

export const duplicateWritingFile = async (plugin: InkPlugin, existingFileRef: TFile, instigatingFile?: TFile | null): Promise<TFile | null> => {
    const v = plugin.app.vault;

    const newFilePath = await getNewTimestampedWritingFilepath(plugin, instigatingFile);
    const newFile = await v.copy(existingFileRef, newFilePath);

    return newFile;
};
