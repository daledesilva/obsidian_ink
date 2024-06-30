import { Notice, TFile } from "obsidian";
import InkPlugin from "src/main";
import { parseFilepath } from "./parseFilepath";
import { DEFAULT_SETTINGS } from "src/types/plugin-settings";

/////////////
/////////////

export const getBaseAttachmentPath = async (plugin: InkPlugin, instigatingFile?: TFile | null): Promise<string> => {
    let baseAttachmentPath: string = '';
    let attachmentFolderLocation;

    if(instigatingFile) {
        if(plugin.settings.customAttachmentFolders) {
            attachmentFolderLocation = plugin.settings.noteAttachmentFolderLocation;
        } else {
            attachmentFolderLocation = DEFAULT_SETTINGS.noteAttachmentFolderLocation;
        }
    } else {
        if(plugin.settings.customAttachmentFolders) {
            attachmentFolderLocation = plugin.settings.notelessAttachmentFolderLocation;
        } else {
            attachmentFolderLocation = DEFAULT_SETTINGS.notelessAttachmentFolderLocation;
        }
    }
    
    if (attachmentFolderLocation === 'obsidian') {
        try {
            const returnedObsPath = await plugin.app.fileManager.getAvailablePathForAttachment('dummy');
            if (returnedObsPath.contains('/')) {
                const { folderpath } = parseFilepath(returnedObsPath);
                console.log('folderPath', folderpath)
                baseAttachmentPath = folderpath;
            }
        } catch (err) {
            console.warn(err);
            new Notice(`Ink Plugin: There was an error accessing the default Obsidian attachment folder. Placing the new file according to the 'vault root' location setting instead.`, 0);
        }

    } else if(instigatingFile && attachmentFolderLocation === 'note') {
        // Use current note's folder
        baseAttachmentPath = parseFilepath(instigatingFile?.path).folderpath;
        
    } else {
        // Use vault root
        baseAttachmentPath = '';
    }

    console.log('baseAttachmentPath', baseAttachmentPath)

    return baseAttachmentPath;
};
