import { TFile } from "obsidian";
import { DRAW_FILE_V1_EXT, WRITE_FILE_V1_EXT } from "src/constants";
import InkPlugin from "src/main";
import { InkFileData } from "./page-file";
import { TLEditorSnapshot, TLShapeId } from "@tldraw/tldraw";

////////
////////

export const convertWriteFileToDraw = async (plugin: InkPlugin, file: TFile) => {
    if (file.extension !== WRITE_FILE_V1_EXT) return;
    const v = plugin.app.vault;

    const pageDataStr = await v.read(file);
    const pageData = JSON.parse(pageDataStr) as InkFileData;

    // Remove the page container from the file
    if ('store' in pageData.tldraw) {
        const store = (pageData.tldraw as TLEditorSnapshot).document.store;
        if (store['shape:writing-container' as TLShapeId]) {
            delete store['shape:writing-container' as TLShapeId];
            await v.modify(file, JSON.stringify(pageData));
        }
    }

    let folderPath = '';
    if (file.parent) {
        folderPath = file.parent.path + '/';
    }
    const newPath = folderPath + file.basename + '.' + DRAW_FILE_V1_EXT;
    await v.rename(file, newPath);
};
