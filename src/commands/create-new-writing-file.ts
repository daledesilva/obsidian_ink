import InkPlugin from "src/main";
import { buildWritingFileData } from "src/components/formats/current/utils/build-file-data";
import { DEFAULT_TLEDITOR_WRITING_SNAPSHOT } from "src/defaults/default-tleditor-writing-snapshot";
import { getNewTimestampedWritingSvgFilepath } from "src/logic/utils/file-manipulation";
import { createFoldersForFilepath } from "src/logic/utils/createFoldersForFilepath";
import { TFile } from "obsidian";
import { buildFileStr } from "src/components/formats/current/utils/buildFileStr";

////////
////////

export const createNewWritingFile = async (plugin: InkPlugin, instigatingFile?: TFile | null) => {
    const filepath = await getNewTimestampedWritingSvgFilepath(plugin, instigatingFile);
    const pageData = buildWritingFileData({
        tlEditorSnapshot: DEFAULT_TLEDITOR_WRITING_SNAPSHOT,
    });
    await createFoldersForFilepath(plugin, filepath);
    const fileRef = await plugin.app.vault.create(filepath, buildFileStr(pageData));
    return fileRef;
}
