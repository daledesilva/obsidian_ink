import { TFile } from "obsidian";
import InkPlugin from "src/main";
import { getPreviewFileVaultPath } from "./getPreviewFileVaultPath";

////////
////////

export const savePngExport = async (plugin: InkPlugin, dataUri: string, fileRef: TFile): Promise<void> => {
    const v = plugin.app.vault;

    const base64Data = dataUri.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');

    const previewFilepath = getPreviewFileVaultPath(plugin, fileRef); // REVIEW: This should probably be moved out of this function
    const previewFileRef = v.getAbstractFileByPath(previewFilepath) as TFile;

    if (previewFileRef && previewFileRef instanceof TFile) {
        v.modifyBinary(previewFileRef, buffer);
    } else {
        v.createBinary(previewFilepath, buffer);
    }
};
