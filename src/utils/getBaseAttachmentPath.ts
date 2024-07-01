import { Notice, TFile } from "obsidian";
import InkPlugin from "src/main";
import { parseFilepath } from "./parseFilepath";
import { DEFAULT_SETTINGS } from "src/types/plugin-settings";

/////////////
/////////////

export const getBaseAttachmentPath = async (plugin: InkPlugin, options: {noteFolderPath?: string | null, obsAttachmentFolderPath?: string | null}): Promise<string> => {
    let baseAttachmentPath: string = '';
    let attachmentFolderLocation;

    if(options.noteFolderPath) {
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
        
        if(options.obsAttachmentFolderPath) {
            baseAttachmentPath = options.obsAttachmentFolderPath;
        } else {
            console.log(`Ink Plugin: There was an error accessing the default Obsidian attachment folder. Placing the new file according to the 'vault root' location setting instead.`, 0);
            baseAttachmentPath = '';
        }

        //await getObsidianAttachmentFolderPath(plugin);

    } else if(attachmentFolderLocation === 'note') {
        
        if(options.noteFolderPath) {
            baseAttachmentPath = options.noteFolderPath;
        } else {
            console.log(`Ink Plugin: There was an error accessing the note's folder. Placing the new file according to the 'vault root' location setting instead.`, 0);
            baseAttachmentPath = '';
        }
        //baseAttachmentPath = parseFilepath(instigatingFile?.path).folderpath;
        
    } else {
        // Use vault root
        baseAttachmentPath = '';
    }

    console.log('baseAttachmentPath', baseAttachmentPath)

    return baseAttachmentPath;

    
};


async function getObsidianAttachmentFolderPath(plugin: InkPlugin): Promise<string | null> {
    let attachmentPath: string | null = null;
    try {
        const returnedObsPath = await plugin.app.fileManager.getAvailablePathForAttachment('dummy');
        if (returnedObsPath.contains('/')) {
            const { folderpath } = parseFilepath(returnedObsPath);
            attachmentPath = folderpath;
        }
    } catch (err) {
        return null;
    }
    return attachmentPath;
}