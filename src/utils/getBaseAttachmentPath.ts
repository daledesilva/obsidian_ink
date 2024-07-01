import { Notice, TFile } from "obsidian";
import InkPlugin from "src/main";
import { parseFilepath } from "./parseFilepath";
import { DEFAULT_SETTINGS } from "src/types/plugin-settings";

/////////////
/////////////

export const getBaseAttachmentPath = async (plugin: InkPlugin, options: {instigatingFileFolderPath?: string | null, obsAttachmentFolderPath?: string | null}): Promise<string> => {
    let baseAttachmentPath: string = '';
    let attachmentFolderLocation;

    if(options.instigatingFileFolderPath) {
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
            console.warn(`Ink Plugin: There was an error accessing the default Obsidian attachment folder. Placing the new file in the vault's root instead.`);
            baseAttachmentPath = '';
        }

    } else if(attachmentFolderLocation === 'note') {
        
        if(options.instigatingFileFolderPath) {
            baseAttachmentPath = options.instigatingFileFolderPath;
        } else {
            console.warn(`Ink Plugin: There was an error accessing the note's folder. Placing the new file in the vault's root instead.`);
            baseAttachmentPath = '';
        }
        
    } else {
        // Use vault root
        baseAttachmentPath = '';
    }

    console.log('baseAttachmentPath', baseAttachmentPath)

    return baseAttachmentPath;

    
};


