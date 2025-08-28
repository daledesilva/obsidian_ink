import InkPlugin from "src/main";
import { buildWritingFileData_v1 } from "src/components/formats/v1-code-blocks/utils/build-file-data";
import { buildFileStr_v1 } from "src/components/formats/v1-code-blocks/utils/buildFileStr";
import { DEFAULT_TLEDITOR_WRITING_SNAPSHOT } from "src/defaults/default-tleditor-writing-snapshot";
import { getNewTimestampedWritingFilepath } from "src/logic/utils/file-manipulation";
import { createFoldersForFilepath } from "src/logic/utils/createFoldersForFilepath";
import { TFile } from "obsidian";

////////
////////

export const createNewWritingFile_v1 = async (plugin: InkPlugin, instigatingFile?: TFile | null) => {
    const filepath = await getNewTimestampedWritingFilepath(plugin, instigatingFile);
    const pageData = buildWritingFileData_v1({
        tlEditorSnapshot: DEFAULT_TLEDITOR_WRITING_SNAPSHOT,
    });
    await createFoldersForFilepath(plugin, filepath);
    const fileRef = await plugin.app.vault.create(filepath, buildFileStr_v1(pageData));
    return fileRef;
}

