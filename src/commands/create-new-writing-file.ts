import InkPlugin from "src/main";
import { buildWritingFileData, stringifyPageData } from "src/utils/page-file";
import defaultSnapshot from "src/defaults/default-tldraw-writing-store";
import { getNewTimestampedWritingFilepath, createFoldersForFilepath } from "src/utils/file-manipulation";

////////
////////

const createNewWritingFile = async (plugin: InkPlugin) => {
    const filepath = await getNewTimestampedWritingFilepath(plugin);
    const pageData = buildWritingFileData({
        tldrawData: defaultSnapshot,
    });
    await createFoldersForFilepath(plugin, filepath);
    const noteRef = await plugin.app.vault.create(filepath, stringifyPageData(pageData));
    return noteRef;
}


export default createNewWritingFile;