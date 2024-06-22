import InkPlugin from "src/main";
import { buildWritingFileData, stringifyPageData } from "src/utils/page-file";
import defaultSnapshot from "src/defaults/default-tldraw-writing-store";
import { getNewTimestampedWritingFilepath } from "src/utils/file-manipulation";
import { createFoldersForFilepath } from "src/utils/createFoldersForFilepath";

////////
////////

const createNewWritingFile = async (plugin: InkPlugin) => {
    const filepath = await getNewTimestampedWritingFilepath(plugin);
    const pageData = buildWritingFileData({
        tldrawData: defaultSnapshot,
    });
    await createFoldersForFilepath(plugin, filepath);
    const fileRef = await plugin.app.vault.create(filepath, stringifyPageData(pageData));
    return fileRef;
}


export default createNewWritingFile;