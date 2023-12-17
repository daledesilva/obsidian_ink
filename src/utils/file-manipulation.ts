import { TFile, Vault } from "obsidian";
import { DRAW_FILE_EXT, WRITE_FILE_EXT } from "src/constants";
import InkPlugin from "src/main";
import { PageData } from "./page-file";



export const convertWriteFileToDraw = async (plugin: InkPlugin, file: TFile) => {
    if(file.extension !== WRITE_FILE_EXT) return;
    const v = plugin.app.vault;

    const pageDataStr = await v.read(file as TFile);
    const pageData = JSON.parse(pageDataStr) as PageData;

    // Remove the page container from the file
    if(pageData.tldraw.store['shape:primary_container']){
        delete pageData.tldraw.store['shape:primary_container'];
        await v.modify(file, JSON.stringify(pageData));
    }

    let folderPath = '';
    if(file.parent) {
        folderPath = file.parent.path + '/';
    }
    const newPath = folderPath + file.basename + '.' + DRAW_FILE_EXT;
    await v.rename(file, newPath);
}