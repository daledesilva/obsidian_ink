import InkPlugin from "src/main";
import { buildDrawingFileData, stringifyPageData } from "src/utils/page-file";
import {defaultTLEditorDrawingSnapshot} from "src/defaults/default-tleditor-drawing-snapshot";
import { getNewTimestampedDrawingFilepath } from "src/utils/file-manipulation";
import { createFoldersForFilepath } from "src/utils/createFoldersForFilepath";
import { TFile } from "obsidian";

////////
////////

const createNewDrawingFile = async (plugin: InkPlugin, instigatingFile?: TFile | null) => {
    const filepath = await getNewTimestampedDrawingFilepath(plugin, instigatingFile);
    const pageData = buildDrawingFileData({
        tlEditorSnapshot: defaultTLEditorDrawingSnapshot,
    });
    await createFoldersForFilepath(plugin, filepath);
    const fileRef = await plugin.app.vault.create(filepath, stringifyPageData(pageData));
    return fileRef;
}

export default createNewDrawingFile;