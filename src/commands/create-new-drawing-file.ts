import InkPlugin from "src/main";
import { buildDrawingFileData } from "src/components/formats/current/utils/build-file-data";
import {DEFAULT_TLEDITOR_DRAWING_SNAPSHOT} from "src/defaults/default-tleditor-drawing-snapshot";
import { getNewTimestampedDrawingSvgFilepath } from "src/logic/utils/file-manipulation";
import { createFoldersForFilepath } from "src/logic/utils/createFoldersForFilepath";
import { TFile } from "obsidian";
import { buildFileStr } from "src/components/formats/current/utils/buildFileStr";

////////
////////

export const createNewDrawingFile = async (plugin: InkPlugin, instigatingFile?: TFile | null) => {
    const filepath = await getNewTimestampedDrawingSvgFilepath(plugin, instigatingFile);
    const pageData = buildDrawingFileData({
        tlEditorSnapshot: DEFAULT_TLEDITOR_DRAWING_SNAPSHOT,
    });
    await createFoldersForFilepath(plugin, filepath);
    const fileRef = await plugin.app.vault.create(filepath, buildFileStr(pageData));
    return fileRef;
}
