import InkPlugin from "src/main";
import { buildDrawingFileData, stringifyPageData } from "src/utils/page-file";
import {starterTldrawStoreDrawingSnapshot} from "src/defaults/default-tldraw-drawing-store";
import { getNewTimestampedDrawingFilepath } from "src/utils/file-manipulation";
import { createFoldersForFilepath } from "src/utils/createFoldersForFilepath";
import { TFile } from "obsidian";

////////
////////

const createNewDrawingFile = async (plugin: InkPlugin, instigatingFile?: TFile | null) => {
    const filepath = await getNewTimestampedDrawingFilepath(plugin, instigatingFile);
    const pageData = buildDrawingFileData({
        tlStoreSnapshot: starterTldrawStoreDrawingSnapshot,
    });
    await createFoldersForFilepath(plugin, filepath);
    const fileRef = await plugin.app.vault.create(filepath, stringifyPageData(pageData));
    return fileRef;
}

export default createNewDrawingFile;