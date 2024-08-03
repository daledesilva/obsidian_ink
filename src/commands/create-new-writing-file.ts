import InkPlugin from "src/main";
import { buildWritingFileData, stringifyPageData } from "src/utils/page-file";
import { starterTldrawStoreWritingSnapshot } from "src/defaults/default-tldraw-writing-store";
import { getNewTimestampedWritingFilepath } from "src/utils/file-manipulation";
import { createFoldersForFilepath } from "src/utils/createFoldersForFilepath";
import { TFile } from "obsidian";

////////
////////

const createNewWritingFile = async (plugin: InkPlugin, instigatingFile?: TFile | null) => {
    const filepath = await getNewTimestampedWritingFilepath(plugin, instigatingFile);
    const pageData = buildWritingFileData({
        tlStoreSnapshot: starterTldrawStoreWritingSnapshot,
    });
    await createFoldersForFilepath(plugin, filepath);
    const fileRef = await plugin.app.vault.create(filepath, stringifyPageData(pageData));
    return fileRef;
}


export default createNewWritingFile;