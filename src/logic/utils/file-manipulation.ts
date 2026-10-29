import { TFile, normalizePath } from "obsidian";
import { DRAW_FILE_V1_EXT, WRITE_FILE_V1_EXT } from "src/constants";
import InkPlugin from "src/main";
import { getDateFilename } from "./getDateFilename";
import { getVersionedFilepath } from "./getVersionedFilepath";
import { getBaseAttachmentPath } from "./getBaseAttachmentPath";
import { getWritingSubfolderPath, getDrawingSubfolderPath } from "./getSubfolderPaths";
import { parseFilepath } from "./parseFilepath";
import { getObsidianAttachmentFolderPath, logResolvedAttachmentFolder } from "./obsidian-interfaces";
import { debug } from "./universal-dev-logging";

/////////
/////////

export const getNewTimestampedWritingFilepath = async (plugin: InkPlugin, instigatingFile?: TFile | null): Promise<string> => {
    const obsAttachmentFolderPath = await getObsidianAttachmentFolderPath(plugin, instigatingFile?.path ?? null);
    const instigatingFileFolderPath = instigatingFile ? parseFilepath(instigatingFile?.path).folderpath : null;
    let basePath = await getBaseAttachmentPath(plugin, {
        obsAttachmentFolderPath,
        instigatingFileFolderPath,
    });
    let subFolderPath = getWritingSubfolderPath(plugin);
    const fullPath = await getNewTimestampedFilepath(plugin, WRITE_FILE_V1_EXT, `${basePath}/${subFolderPath}`);
    return fullPath;
}

export const getNewTimestampedDrawingFilepath = async (plugin: InkPlugin, instigatingFile?: TFile | null) => {
    const obsAttachmentFolderPath = await getObsidianAttachmentFolderPath(plugin, instigatingFile?.path ?? null);
    const instigatingFileFolderPath = instigatingFile ? parseFilepath(instigatingFile?.path).folderpath : null;
    let basePath = await getBaseAttachmentPath(plugin, {
        obsAttachmentFolderPath,
        instigatingFileFolderPath,
    });
    let subFolderPath = getDrawingSubfolderPath(plugin);
    const fullPath = await getNewTimestampedFilepath(plugin, DRAW_FILE_V1_EXT, `${basePath}/${subFolderPath}`);
    return fullPath;
}

// V2 drawings are SVG files. Provide a timestamped .svg destination in the standard Drawing subfolder
export const getNewTimestampedDrawingSvgFilepath = async (plugin: InkPlugin, instigatingFile?: TFile | null) => {
    const obsAttachmentFolderPath = await getObsidianAttachmentFolderPath(plugin, instigatingFile?.path ?? null);
    const instigatingFileFolderPath = instigatingFile ? parseFilepath(instigatingFile?.path).folderpath : null;
    let basePath = await getBaseAttachmentPath(plugin, {
        obsAttachmentFolderPath,
        instigatingFileFolderPath,
    });
    let subFolderPath = getDrawingSubfolderPath(plugin);
    logResolvedAttachmentFolder(basePath, obsAttachmentFolderPath);
    const fullPath = await getNewTimestampedFilepath(plugin, 'svg', `${basePath}/${subFolderPath}`);
    return fullPath;
}
export const getNewTimestampedWritingSvgFilepath = async (plugin: InkPlugin, instigatingFile?: TFile | null) => {
    const obsAttachmentFolderPath = await getObsidianAttachmentFolderPath(plugin, instigatingFile?.path ?? null);
    const instigatingFileFolderPath = instigatingFile ? parseFilepath(instigatingFile?.path).folderpath : null;
    let basePath = await getBaseAttachmentPath(plugin, {
        obsAttachmentFolderPath,
        instigatingFileFolderPath,
    });
    let subFolderPath = getWritingSubfolderPath(plugin);
    logResolvedAttachmentFolder(basePath, obsAttachmentFolderPath);
    const fullPath = await getNewTimestampedFilepath(plugin, 'svg', `${basePath}/${subFolderPath}`);
    return fullPath;
}

/** Builds the versioned timestamped file path inside `folderPath`. */
const getNewTimestampedFilepath = async (plugin: InkPlugin, ext: string, folderPath: string): Promise<string> => {
    const filename = getDateFilename() + '.' + ext
    const versionedFilepath = await getVersionedFilepath(plugin, `${folderPath}/${filename}`);
    debug(['Ink file destination', normalizePath(versionedFilepath)]);
    return normalizePath(versionedFilepath);
}

//////////////
//////////////
