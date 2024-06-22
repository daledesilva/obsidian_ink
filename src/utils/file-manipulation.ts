import { normalizePath } from "obsidian";
import { DRAW_FILE_EXT, WRITE_FILE_EXT } from "src/constants";
import InkPlugin from "src/main";
import { getDateFilename } from "./getDateFilename";
import { getVersionedFilepath } from "./getVersionedFilepath";
import { getBaseAttachmentPath } from "./getBaseAttachmentPath";
import { getWritingSubfolderPath, getDrawingSubfolderPath } from "./getSubfolderPaths";

/////////
/////////

const getNewTimestampedFilepath = async (plugin: InkPlugin, ext: string, folderPath: string): Promise<string> => {
    const filename = getDateFilename() + '.' + ext
    const versionedFilepath = await getVersionedFilepath(plugin, `${folderPath}/${filename}`);
    return normalizePath(versionedFilepath);
}

export const getNewTimestampedWritingFilepath = async (plugin: InkPlugin) => {
    let basePath = await getBaseAttachmentPath(plugin);
    let subFolderPath = getWritingSubfolderPath(plugin);
    return getNewTimestampedFilepath(plugin, WRITE_FILE_EXT, `${basePath}/${subFolderPath}`);
}

export const getNewTimestampedDrawingFilepath = async (plugin: InkPlugin) => {
    let basePath = await getBaseAttachmentPath(plugin);
    let subFolderPath = getDrawingSubfolderPath(plugin);
    return getNewTimestampedFilepath(plugin, DRAW_FILE_EXT, `${basePath}/${subFolderPath}`);
}

//////////////
//////////////