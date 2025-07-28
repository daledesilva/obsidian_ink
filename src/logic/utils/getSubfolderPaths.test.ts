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

describe(`getWritingSubfolderPath tests`, () => {

    test(`Almost empty writing Subfolder`, () => {
        const mockPlugin = createMockPlugin() as InkPlugin;
        mockPlugin.settings.customAttachmentFolders = true;
        mockPlugin.settings.writingSubfolder = '  ';

        const result = getWritingSubfolderPath(mockPlugin);
        expect(result).toEqual('');
    })

    test(`Empty writing Subfolder`, () => {
        const mockPlugin = createMockPlugin() as InkPlugin;
        mockPlugin.settings.customAttachmentFolders = true;
        mockPlugin.settings.writingSubfolder = '';

        const result = getWritingSubfolderPath(mockPlugin);
        expect(result).toEqual('');
    })

    test(`Undefined writing Subfolder`, () => {
        const mockPlugin = createMockPlugin() as InkPlugin;
        mockPlugin.settings.customAttachmentFolders = true;

        const result = getWritingSubfolderPath(mockPlugin);
        expect(result).toEqual('');
    })

    test(`customAttachmentFolders = false`, () => {
        const mockPlugin = createMockPlugin() as InkPlugin;
        mockPlugin.settings.customAttachmentFolders = false;
        mockPlugin.settings.writingSubfolder = 'fake-folder-path';

        const result = getWritingSubfolderPath(mockPlugin);
        expect(result).toEqual(DEFAULT_SETTINGS.writingSubfolder);
    })

});

//////////

describe(`getDrawomgSubfolderPath tests`, () => {

    test(`Almost empty drawing Subfolder`, () => {
        const mockPlugin = createMockPlugin() as InkPlugin;
        mockPlugin.settings.customAttachmentFolders = true;
        mockPlugin.settings.drawingSubfolder = '  ';

        const result = getDrawingSubfolderPath(mockPlugin);
        expect(result).toEqual('');
    })

    test(`Empty drawing Subfolder`, () => {
        const mockPlugin = createMockPlugin() as InkPlugin;
        mockPlugin.settings.customAttachmentFolders = true;
        mockPlugin.settings.drawingSubfolder = '';

        const result = getDrawingSubfolderPath(mockPlugin);
        expect(result).toEqual('');
    })

    test(`Undefined drawing Subfolder`, () => {
        const mockPlugin = createMockPlugin() as InkPlugin;
        mockPlugin.settings.customAttachmentFolders = true;

        const result = getDrawingSubfolderPath(mockPlugin);
        expect(result).toEqual('');
    })

    test(`customAttachmentFolders = false`, () => {
        const mockPlugin = createMockPlugin() as InkPlugin;
        mockPlugin.settings.customAttachmentFolders = false;
        mockPlugin.settings.drawingSubfolder = 'fake-folder-path';

        const result = getDrawingSubfolderPath(mockPlugin);
        expect(result).toEqual(DEFAULT_SETTINGS.drawingSubfolder);
    })

});
