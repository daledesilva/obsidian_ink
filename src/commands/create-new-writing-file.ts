import InkPlugin from "src/main";
import { buildWritingFileData } from "src/components/formats/current/utils/build-file-data";
import { buildFileStr_v2 } from "src/logic/utils/buildFileStr";
import { DEFAULT_TLEDITOR_WRITING_SNAPSHOT } from "src/defaults/default-tleditor-writing-snapshot";
import { getNewTimestampedWritingFilepath, getNewTimestampedWritingSvgFilepath } from "src/logic/utils/file-manipulation";
import { createFoldersForFilepath } from "src/logic/utils/createFoldersForFilepath";
import { TFile } from "obsidian";

////////
////////

export const createNewWritingFile = async (plugin: InkPlugin, instigatingFile?: TFile | null) => {
    const filepath = await getNewTimestampedWritingSvgFilepath(plugin, instigatingFile);
    const pageData = buildWritingFileData({
        tlEditorSnapshot: DEFAULT_TLEDITOR_WRITING_SNAPSHOT,
    });
    await createFoldersForFilepath(plugin, filepath);
    const fileRef = await plugin.app.vault.create(filepath, buildFileStr_v2(pageData));
    return fileRef;
}
