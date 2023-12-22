import InkPlugin from "src/main";
import { buildPageFile } from "src/utils/page-file";
import defaultSnapshot from "src/defaults/default-tldraw-drawing-store";
import { getNewTimestampedDrawingFilepath } from "src/utils/file-manipulation";




const createNewDrawingFile = async (plugin: InkPlugin) => {
    const filepath = await getNewTimestampedDrawingFilepath(plugin);
    const fileContents = buildPageFile(defaultSnapshot);
    const noteRef = await plugin.app.vault.create(filepath, fileContents);
    return noteRef;
}


export default createNewDrawingFile;