import { describe, expect, test } from "@jest/globals";
import InkPlugin from "src/main";
import { getBaseAttachmentPath } from "./getBaseAttachmentPath";

////////////
////////////

function createMockPlugin() {
    return {
        settings: {},
        app: {
            vault: {},
            fileManager: {},
        }
    }
}

function createMockTFile() {
    return {
        settings: {},
        app: {
            vault: {}
        }
    }
}

/////////////

describe(`getBaseAttachmentPath tests`, () => {

    // Creating ink file from within a note
    ///////////////////////////////////////

    test(`Created from file: No customisation`, async () => {
        const mockPlugin = createMockPlugin() as InkPlugin;
        mockPlugin.settings.customAttachmentFolders = false;
        const result = await getBaseAttachmentPath(mockPlugin, {
            obsAttachmentFolderPath: 'obs attachments',
            instigatingFileFolderPath: 'file folder',
        });
        expect(result).toEqual('obs attachments');
    })

    test(`Created from file: Obsidian attachment folder`, async () => {
        const mockPlugin = createMockPlugin() as InkPlugin;
        mockPlugin.settings.customAttachmentFolders = true;
        mockPlugin.settings.noteAttachmentFolderLocation = 'obsidian'
        const result = await getBaseAttachmentPath(mockPlugin, {
            obsAttachmentFolderPath: 'obs attachments',
            instigatingFileFolderPath: 'file folder',
        });
        expect(result).toEqual('obs attachments');
    })

    test(`Created from file: Note folder`, async () => {
        const mockPlugin = createMockPlugin() as InkPlugin;
        mockPlugin.settings.customAttachmentFolders = true;
        mockPlugin.settings.noteAttachmentFolderLocation = 'note'
        const result = await getBaseAttachmentPath(mockPlugin, {
            obsAttachmentFolderPath: 'obs attachments',
            instigatingFileFolderPath: 'file folder',
        });
        expect(result).toEqual('file folder');
    })
    
    test(`Created from file: Vault root`, async () => {
        const mockPlugin = createMockPlugin() as InkPlugin;
        mockPlugin.settings.customAttachmentFolders = true;
        mockPlugin.settings.noteAttachmentFolderLocation = 'root';
        const result = await getBaseAttachmentPath(mockPlugin, {
            obsAttachmentFolderPath: 'obs attachments',
            instigatingFileFolderPath: 'file folder',
        });
        expect(result).toEqual('');
    })

    // Creating ink file independantly
    //////////////////////////////////

    test(`Created independantly: No customisation`, async () => {
        const mockPlugin = createMockPlugin() as InkPlugin;
        mockPlugin.settings.customAttachmentFolders = false;
        const result = await getBaseAttachmentPath(mockPlugin, {
            obsAttachmentFolderPath: 'obs attachments',
        });
        expect(result).toEqual('obs attachments');
    })

    test(`Created independantly: Obsidian attachment folder`, async () => {
        const mockPlugin = createMockPlugin() as InkPlugin;
        mockPlugin.settings.customAttachmentFolders = true;
        mockPlugin.settings.noteAttachmentFolderLocation = 'obsidian'
        const result = await getBaseAttachmentPath(mockPlugin, {
            obsAttachmentFolderPath: 'obs attachments',
        });
        expect(result).toEqual('');
    })

    test(`Created independantly: Obsidian attachment folder (error)`, async () => {
        const mockPlugin = createMockPlugin() as InkPlugin;
        mockPlugin.settings.customAttachmentFolders = true;
        mockPlugin.settings.noteAttachmentFolderLocation = 'obsidian'
        const result = await getBaseAttachmentPath(mockPlugin, {
            obsAttachmentFolderPath: null,
        });
        expect(result).toEqual(''); // Should return vault root instead
    })

    test(`Created independantly: Vault root`, async () => {
        const mockPlugin = createMockPlugin() as InkPlugin;
        mockPlugin.settings.customAttachmentFolders = true;
        mockPlugin.settings.noteAttachmentFolderLocation = 'note'
        const result = await getBaseAttachmentPath(mockPlugin, {
            obsAttachmentFolderPath: 'obs attachments',
        });
        expect(result).toEqual('');
    })


});
