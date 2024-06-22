import { Notice, TFile } from "obsidian";
import InkPlugin from "src/main";
import { saveLocally } from "./storage";
import { getNewTimestampedDrawingFilepath, getNewTimestampedWritingFilepath } from "./file-manipulation";


export const rememberDrawingFile = async (plugin: InkPlugin, existingFileRef: TFile) => {
    const v = plugin.app.vault;

    if (!(existingFileRef instanceof TFile)) {
        new Notice('No file found to copy');
        return;
    }

    saveLocally('rememberedDrawingFile', existingFileRef.path);
    new Notice(`Drawing file copied.\nRun 'Insert drawing file' where desired.`);
};

export const rememberWritingFile = async (plugin: InkPlugin, existingFileRef: TFile) => {
    const v = plugin.app.vault;

    if (!(existingFileRef instanceof TFile)) {
        new Notice('No file found to copy');
        return null;
    }

    saveLocally('rememberedWritingFile', existingFileRef.path);
    new Notice(`Writing file copied.\nRun 'Insert writing file' where desired.`);
};

export const duplicateDrawingFile = async (plugin: InkPlugin, existingFileRef: TFile): Promise<TFile | null> => {
    const v = plugin.app.vault;

    const newFilePath = await getNewTimestampedDrawingFilepath(plugin);
    const newFile = await v.copy(existingFileRef, newFilePath);

    return newFile;
};

export const duplicateWritingFile = async (plugin: InkPlugin, existingFileRef: TFile): Promise<TFile> => {
    const v = plugin.app.vault;

    const newFilePath = await getNewTimestampedWritingFilepath(plugin);
    const newFile = await v.copy(existingFileRef, newFilePath);

    return newFile;
};
