import { TFile, normalizePath } from "obsidian";
import { DRAW_FILE_EXT, WRITE_FILE_EXT } from "src/constants";
import InkPlugin from "src/main";
import { getDateFilename } from "./getDateFilename";
import { getVersionedFilepath } from "./getVersionedFilepath";
import { getBaseAttachmentPath } from "./getBaseAttachmentPath";
import { getWritingSubfolderPath, getDrawingSubfolderPath } from "./getSubfolderPaths";
import { parseFilepath } from "./parseFilepath";
import { getObsidianAttachmentFolderPath } from "./obsidian-interfaces";

/////////
/////////

export const getNewTimestampedWritingFilepath = async (plugin: InkPlugin, instigatingFile?: TFile | null): Promise<string> => {
    const obsAttachmentFolderPath = await getObsidianAttachmentFolderPath(plugin);
    const instigatingFileFolderPath = instigatingFile ? parseFilepath(instigatingFile?.path).folderpath : null;
    let basePath = await getBaseAttachmentPath(plugin, {
        obsAttachmentFolderPath,
        instigatingFileFolderPath,
    });
    let subFolderPath = getWritingSubfolderPath(plugin);
    const fullPath = await getNewTimestampedFilepath(plugin, WRITE_FILE_EXT, `${basePath}/${subFolderPath}`);
    return fullPath;
}

export const getNewTimestampedDrawingFilepath = async (plugin: InkPlugin, instigatingFile?: TFile | null) => {
    const obsAttachmentFolderPath = await getObsidianAttachmentFolderPath(plugin);
    const instigatingFileFolderPath = instigatingFile ? parseFilepath(instigatingFile?.path).folderpath : null;
    let basePath = await getBaseAttachmentPath(plugin, {
        obsAttachmentFolderPath,
        instigatingFileFolderPath,
    });
    let subFolderPath = getDrawingSubfolderPath(plugin);
    const fullPath = await getNewTimestampedFilepath(plugin, DRAW_FILE_EXT, `${basePath}/${subFolderPath}`);
    return fullPath;
}

const getNewTimestampedFilepath = async (plugin: InkPlugin, ext: string, folderPath: string): Promise<string> => {
    const filename = getDateFilename() + '.' + ext
    const versionedFilepath = await getVersionedFilepath(plugin, `${folderPath}/${filename}`);
    return normalizePath(versionedFilepath);
}

//////////////
//////////////