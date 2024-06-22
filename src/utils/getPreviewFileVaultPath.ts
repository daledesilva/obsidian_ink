import { TFile } from "obsidian";
import InkPlugin from "src/main";


export const getPreviewFileVaultPath = (plugin: InkPlugin, fileRef: TFile): string => {
    if (!fileRef) return '';
    const v = plugin.app.vault;
    const previewFilepath = fileRef.parent?.path + '/' + fileRef.basename + '.png';
    return previewFilepath;
};

export const getPreviewFileResourcePath = (plugin: InkPlugin, fileRef: TFile): string | null => {
    const v = plugin.app.vault;

    const previewFilepath = fileRef.parent?.path + '/' + fileRef.basename + '.png';

    const previewFileRef = v.getAbstractFileByPath(previewFilepath);
    if (!previewFileRef || !(previewFileRef instanceof TFile)) return null;

    const previewFileResourcePath = v.getResourcePath(previewFileRef);
    return previewFileResourcePath;
};
