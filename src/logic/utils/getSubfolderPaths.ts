import InkPlugin from "src/main";
import { DEFAULT_SETTINGS } from "src/types/plugin-settings";
import { sanitiseInkSubfolderPath } from "./ink-subfolder-path";

//////////////
//////////////

/** Resolves the writing subfolder from settings, repaired so Obsidian can actually create it (#64). */
export const getWritingSubfolderPath = (plugin: InkPlugin): string => {
    let subFolderPath = DEFAULT_SETTINGS.writingSubfolder;
    if (plugin.settings.customAttachmentFolders) {
        subFolderPath = plugin.settings.writingSubfolder || '';
    }
    return sanitiseInkSubfolderPath(subFolderPath).path;
};
/** Resolves the drawing subfolder from settings, repaired so Obsidian can actually create it (#64). */
export const getDrawingSubfolderPath = (plugin: InkPlugin): string => {
    let subFolderPath = DEFAULT_SETTINGS.drawingSubfolder;
    if (plugin.settings.customAttachmentFolders) {
        subFolderPath = plugin.settings.drawingSubfolder || '';
    }
    return sanitiseInkSubfolderPath(subFolderPath).path;
};
