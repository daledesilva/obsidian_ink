import InkPlugin from "src/main";
import { buildDrawingFileData } from "src/components/formats/tldraw_v1/utils/build-file-data";
import { buildFileStr } from "src/logic/utils/buildFileStr";
import {DEFAULT_TLEDITOR_DRAWING_SNAPSHOT} from "src/defaults/default-tleditor-drawing-snapshot";
import { getNewTimestampedDrawingFilepath } from "src/logic/utils/file-manipulation";
import { createFoldersForFilepath } from "src/logic/utils/createFoldersForFilepath";
import { TFile } from "obsidian";

////////
////////

const createNewDrawingFile = async (plugin: InkPlugin, instigatingFile?: TFile | null) => {
    const filepath = await getNewTimestampedDrawingFilepath(plugin, instigatingFile);
    const pageData = buildDrawingFileData({
        tlEditorSnapshot: DEFAULT_TLEDITOR_DRAWING_SNAPSHOT,
    });
    await createFoldersForFilepath(plugin, filepath);
    const fileRef = await plugin.app.vault.create(filepath, buildFileStr(pageData));
    return fileRef;
}

export default createNewDrawingFile;