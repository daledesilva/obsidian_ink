import { Notice, TFile, normalizePath } from "obsidian";
import { DRAW_FILE_EXT, ATTACHMENT_SUBFOLDER_NAME, WRITE_FILE_EXT, WRITING_SUBFOLDER_NAME, DRAWING_SUBFOLDER_NAME } from "src/constants";
import InkPlugin from "src/main";
import { InkFileData } from "./page-file";
import { TLShapeId } from "@tldraw/tldraw";
import { saveLocally } from "./storage";
import * as path from 'path';

/////////
/////////

const getNewTimestampedFilepath = async (plugin: InkPlugin, ext: string, subfolder: string): string => {
    const date = new Date();
    let monthStr = date.getMonth().toString();
    let dateStr = date.getDate().toString();
    let hours = date.getHours();
    let minutesStr = date.getMinutes().toString();
    let suffix = 'am';

    if(minutesStr.length < 2) minutesStr = '0' + minutesStr;
    let filename = date.getFullYear() + '.' + monthStr + '.' + dateStr + ' - ' + hours + '.' + minutesStr + suffix;
    
    const filepath = await getUsableAttachmentPath(plugin, ATTACHMENT_SUBFOLDER_NAME + '/' + subfolder + '/' + filename + '.' + ext);
    return filepath;
}
export const getNewTimestampedWritingFilepath = async (plugin: InkPlugin) => {
    return getNewTimestampedFilepath(plugin, WRITE_FILE_EXT, WRITING_SUBFOLDER_NAME);
}
export const getNewTimestampedDrawingFilepath = async (plugin: InkPlugin) => {
    return getNewTimestampedFilepath(plugin, DRAW_FILE_EXT, DRAWING_SUBFOLDER_NAME);
}

export const getVersionedFilepath = async (plugin: InkPlugin, seedFilepath: string): Promise<string> => {
    const {
        dir,
        name,
        ext
    } = path.parse(seedFilepath);
    let pathAndBasename = dir + '/' + name;

    let pathAndVersionedBasename = pathAndBasename;
    let version = 1;
    while( await plugin.app.vault.adapter.exists(`${pathAndVersionedBasename+ext}`) ) {
        version ++;
		pathAndVersionedBasename = pathAndBasename + ' (' + version + ')';
    }

    return pathAndVersionedBasename + ext;
}

export const getUsableAttachmentPath = async (plugin: InkPlugin, seedFilepath: string): Promise<string|null> => {
    let obsAttachmentPath: string
    let correctedFilepath: string;
    let usableFilepath: string;

    try {
        obsAttachmentPath = await plugin.app.fileManager.getAvailablePathForAttachment('dummy');
        console.log('obsAttachmentPath:', obsAttachmentPath);
        if(obsAttachmentPath.contains('/')) {
            const {dir} = path.parse(obsAttachmentPath);
            correctedFilepath = dir + '/' + normalizePath(seedFilepath);
        } else {
            // it's only filename, so just ignore it
            correctedFilepath = seedFilepath;
        }
        console.log('obsAttachmentPath:', obsAttachmentPath);
        console.log('correctedFilepath:', correctedFilepath);
    } catch(err) {
        console.warn(err);
        new Notice(`There was an error using your preferred attachment folder, using the root of your vault instead.`, 0)
        correctedFilepath = seedFilepath;
    }

    usableFilepath = await getVersionedFilepath(plugin, correctedFilepath);
    return usableFilepath;
}

export const convertWriteFileToDraw = async (plugin: InkPlugin, file: TFile) => {
    if(file.extension !== WRITE_FILE_EXT) return;
    const v = plugin.app.vault;

    const pageDataStr = await v.read(file);
    const pageData = JSON.parse(pageDataStr) as InkFileData;

    // Remove the page container from the file
    if(pageData.tldraw.store['shape:primary_container' as TLShapeId]){
        delete pageData.tldraw.store['shape:primary_container' as TLShapeId];
        await v.modify(file, JSON.stringify(pageData));
    }

    let folderPath = '';
    if(file.parent) {
        folderPath = file.parent.path + '/';
    }
    const newPath = folderPath + file.basename + '.' + DRAW_FILE_EXT;
    await v.rename(file, newPath);
}

export const duplicateDrawingFile = async (plugin: InkPlugin, existingFileRef: TFile): Promise<TFile | null> => {
    const v = plugin.app.vault;

    if(!(existingFileRef instanceof TFile)) {
        new Notice('No file found to duplicate');
        return null;
    }

    const newFilePath = await getNewTimestampedDrawingFilepath(plugin);
    const newFile = await v.copy(existingFileRef, newFilePath);

    saveLocally('lastDrawingDuplicate', newFilePath);
    new Notice("Drawing file duplicated");

    return newFile;
}

export const duplicateWritingFile = async (plugin: InkPlugin, existingFileRef: TFile): Promise<TFile | null> => {
    const v = plugin.app.vault;

    if(!(existingFileRef instanceof TFile)) {
        new Notice('No file found to duplicate');
        return null;
    }

    const newFilePath = await getNewTimestampedWritingFilepath(plugin);
    const newFile = await v.copy(existingFileRef, newFilePath);

    saveLocally('lastWritingDuplicate', newFilePath);
    new Notice("Writing file duplicated");

    return newFile;
}

export const savePngExport = async (plugin: InkPlugin, dataUri: string, fileRef: TFile): Promise<void> => {
    const v = plugin.app.vault;
    
    const base64Data = dataUri.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');

    const previewFilepath = getPreviewFileVaultPath(plugin, fileRef);   // REVIEW: This should probably be moved out of this function
    const previewFileRef = v.getAbstractFileByPath(previewFilepath) as TFile;
	
    if(previewFileRef && previewFileRef instanceof TFile) {
        v.modifyBinary(previewFileRef, buffer);
    } else {
        v.createBinary(previewFilepath, buffer);    
    }
}

export const getPreviewFileVaultPath = (plugin: InkPlugin, fileRef: TFile): string => {
    if(!fileRef) return '';
    const v = plugin.app.vault;
    const previewFilepath = fileRef.parent?.path + '/' + fileRef.basename + '.png';
    return previewFilepath;
}

export const getPreviewFileResourcePath = (plugin: InkPlugin, fileRef: TFile): string | null => {
    const v = plugin.app.vault;

    const previewFilepath = fileRef.parent?.path + '/' + fileRef.basename + '.png';

    const previewFileRef = v.getAbstractFileByPath(previewFilepath)
    if(!previewFileRef || !(previewFileRef instanceof TFile)) return null;
    
    const previewFileResourcePath = v.getResourcePath(previewFileRef);
    return previewFileResourcePath;
}

export const needsTranscriptUpdate = (pageData: InkFileData): boolean => {
	// TODO: Also check if hte transcript is older than the last file update
	// if(!pageData.meta.transcript) {
		// return true;
	// } else {
		return false;
	// }
}

export const saveWriteFileTranscript = async (plugin: InkPlugin, fileRef: TFile, transcript: string) => {
    if(fileRef.extension !== WRITE_FILE_EXT) return;
    const v = plugin.app.vault;

    // console.log('saving transcript to', fileRef.path);

    const pageDataStr = await v.read(fileRef as TFile);
    const pageData = JSON.parse(pageDataStr) as InkFileData;

    // TODO: Add in a date of the transcript

    pageData.meta.transcript = "The new transcript";
    const newPageDataStr = JSON.stringify(pageData, null, '\t');

    await v.modify(fileRef, newPageDataStr, { mtime: fileRef.stat.mtime });
}


export const createFoldersForFilepath = async (plugin: InkPlugin, path: string): Promise<void> => {
    const folders = path.split('/');
    
    // Remove the filename at the end
    folders.pop();

    try {
        await plugin.app.vault.createFolder(folders.join('/'));
    } catch(e) {
        // console.log(e);
    }
}