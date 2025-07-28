import InkPlugin from "src/main";
import { parseFilepath } from "./parseFilepath";

////////////
////////////

export async function getObsidianAttachmentFolderPath(plugin: InkPlugin): Promise<string | null> {
    let attachmentPath: string | null = null;
    try {
        const returnedObsPath = await plugin.app.fileManager.getAvailablePathForAttachment('dummy');
        if (returnedObsPath.contains('/')) {
            const { folderpath } = parseFilepath(returnedObsPath);
            attachmentPath = folderpath;
        }
    } catch (err) {
        return null;
    }
    return attachmentPath;
}