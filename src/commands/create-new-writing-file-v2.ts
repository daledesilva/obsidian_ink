import InkPlugin from "src/main";
import { buildWritingFileData } from "src/logic/utils/page-file";
import { buildFileStr } from "src/logic/utils/buildFileStr";
import { DEFAULT_TLEDITOR_WRITING_SNAPSHOT } from "src/defaults/default-tleditor-writing-snapshot";
import { getNewTimestampedWritingFilepath, getNewTimestampedWritingSvgFilepath } from "src/logic/utils/file-manipulation";
import { createFoldersForFilepath } from "src/logic/utils/createFoldersForFilepath";
import { TFile } from "obsidian";

////////
////////

const createNewWritingFile_v2 = async (plugin: InkPlugin, instigatingFile?: TFile | null) => {
    const filepath = await getNewTimestampedWritingSvgFilepath(plugin, instigatingFile);
    const pageData = buildWritingFileData({
        tlEditorSnapshot: DEFAULT_TLEDITOR_WRITING_SNAPSHOT,
    });
    await createFoldersForFilepath(plugin, filepath);
    const fileRef = await plugin.app.vault.create(filepath, buildFileStr(pageData));
    return fileRef;
}


export default createNewWritingFile_v2;