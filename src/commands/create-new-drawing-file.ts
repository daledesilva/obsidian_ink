import InkPlugin from "src/main";
import { buildDrawingFileData, stringifyPageData } from "src/utils/page-file";
import defaultSnapshot from "src/defaults/default-tldraw-drawing-store";
import { getNewTimestampedDrawingFilepath } from "src/utils/file-manipulation";
import { createFoldersForFilepath } from "src/utils/createFoldersForFilepath";

////////
////////

const createNewDrawingFile = async (plugin: InkPlugin) => {
    const filepath = await getNewTimestampedDrawingFilepath(plugin);
    const pageData = buildDrawingFileData({
        tldrawData: defaultSnapshot,
    });
    await createFoldersForFilepath(plugin, filepath);
    const fileRef = await plugin.app.vault.create(filepath, stringifyPageData(pageData));
    return fileRef;
}

export default createNewDrawingFile;