import InkPlugin from "src/main";
import { buildDrawingFileData } from "src/logic/utils/page-file";
import { buildFileStr_v1, buildFileStr_v2 } from "src/logic/utils/buildFileStr";
import {DEFAULT_TLEDITOR_DRAWING_SNAPSHOT} from "src/defaults/default-tleditor-drawing-snapshot";
import { getNewTimestampedDrawingFilepath, getNewTimestampedDrawingSvgFilepath } from "src/logic/utils/file-manipulation";
import { createFoldersForFilepath } from "src/logic/utils/createFoldersForFilepath";
import { TFile } from "obsidian";

////////
////////

const createNewDrawingFile_v2 = async (plugin: InkPlugin, instigatingFile?: TFile | null) => {
    const filepath = await getNewTimestampedDrawingSvgFilepath(plugin, instigatingFile);
    const pageData = buildDrawingFileData({
        tlEditorSnapshot: DEFAULT_TLEDITOR_DRAWING_SNAPSHOT,
    });
    await createFoldersForFilepath(plugin, filepath);
    const fileRef = await plugin.app.vault.create(filepath, buildFileStr_v2(pageData));
    return fileRef;
}

export default createNewDrawingFile_v2;