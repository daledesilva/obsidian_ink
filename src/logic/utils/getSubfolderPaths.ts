import InkPlugin from "src/main";
import { DEFAULT_SETTINGS } from "src/types/plugin-settings";

//////////////
//////////////

export const getWritingSubfolderPath = (plugin: InkPlugin): string => {
    let subFolderPath = DEFAULT_SETTINGS.writingSubfolder;
    if (plugin.settings.customAttachmentFolders) {
        subFolderPath = plugin.settings.writingSubfolder || '';
    }
    return subFolderPath.trim();
};
export const getDrawingSubfolderPath = (plugin: InkPlugin): string => {
    let subFolderPath = DEFAULT_SETTINGS.drawingSubfolder;
    if (plugin.settings.customAttachmentFolders) {
        subFolderPath = plugin.settings.drawingSubfolder || '';
    }
    return subFolderPath.trim();
};
