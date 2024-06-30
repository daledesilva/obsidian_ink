import { describe, expect, test } from "@jest/globals";
import InkPlugin from "src/main";
import { getDrawingSubfolderPath, getWritingSubfolderPath } from "./getSubfolderPaths";
import { DEFAULT_SETTINGS } from "src/types/plugin-settings";

////////////
////////////

function createMockPlugin() {
    return {
        settings: {},
        app: {
            vault: {}
        }
    }
}

/////////////

describe(`getBaseAttachmentPath tests`, () => {

    // plugin.settings.customAttachmentFolders = false
    // instigatingFile included
    // instigatingFile note included

    // plugin.settings.customAttachmentFolders = true
    // plugin.settings.noteAttachmentFolderLocation = 'obsidian'
    // plugin.app.fileManager.getAvailablePathForAttachment('dummy') returns something
    // instigatingFile included
    
    // plugin.settings.customAttachmentFolders = true
    // plugin.settings.noteAttachmentFolderLocation = 'obsidian'
    // plugin.app.fileManager.getAvailablePathForAttachment('dummy') returns something valid
    // instigatingFile included

    // plugin.settings.customAttachmentFolders = true
    // plugin.settings.noteAttachmentFolderLocation = 'obsidian'
    // plugin.app.fileManager.getAvailablePathForAttachment('dummy') returns some invalid things
    // instigatingFile included

    // plugin.settings.customAttachmentFolders = true
    // plugin.settings.noteAttachmentFolderLocation = 'note'
    // instigatingFile included

    // plugin.settings.customAttachmentFolders = true
    // plugin.settings.noteAttachmentFolderLocation = 'root'
    // instigatingFile included

    // plugin.settings.customAttachmentFolders = true
    // plugin.settings.notelessAttachmentFolderLocation = 'obsidian'
    // plugin.app.fileManager.getAvailablePathForAttachment('dummy') returns something valid
    // instigatingFile not included

    // plugin.settings.customAttachmentFolders = true
    // plugin.settings.notelessAttachmentFolderLocation = 'obsidian'
    // plugin.app.fileManager.getAvailablePathForAttachment('dummy') returns something invalid things
    // instigatingFile not included

    // plugin.settings.customAttachmentFolders = true
    // plugin.settings.notelessAttachmentFolderLocation = 'root'
    // instigatingFile not included






    // test(`Almost empty writing Subfolder`, () => {
    //     const mockPlugin = createMockPlugin() as InkPlugin;
    //     mockPlugin.settings.customAttachmentFolders = true;
    //     mockPlugin.settings.writingSubfolder = '  ';

    //     const result = getWritingSubfolderPath(mockPlugin);
    //     expect(result).toEqual('');
    // })


});
