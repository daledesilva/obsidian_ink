import { TFile } from "obsidian";
import InkPlugin from "src/main";
import { getPreviewFileVaultPath } from "./getPreviewFileVaultPath";

////////
////////

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = window.atob(base64);
    const buffer = new ArrayBuffer(binaryString.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < binaryString.length; i++) {
        view[i] = binaryString.charCodeAt(i);
    }
    return buffer;
}

export const savePngExport = async (plugin: InkPlugin, dataUri: string, fileRef: TFile): Promise<void> => {
    const v = plugin.app.vault;

    const base64Data = dataUri.split(',')[1];
    const buffer = decodeBase64ToArrayBuffer(base64Data);

    const previewFilepath = getPreviewFileVaultPath(plugin, fileRef); // REVIEW: This should probably be moved out of this function
    const previewAbstract = v.getAbstractFileByPath(previewFilepath);
    const previewFileRef = previewAbstract instanceof TFile ? previewAbstract : null;

    if (previewFileRef) {
        await v.modifyBinary(previewFileRef, buffer);
    } else {
        await v.createBinary(previewFilepath, buffer);
    }
};
