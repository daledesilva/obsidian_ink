import { Notice } from "obsidian";
import InkPlugin from "src/main";
import { parseFilepath } from "./parseFilepath";
import { DEFAULT_SETTINGS } from "src/types/plugin-settings";

export const getBaseAttachmentPath = async (plugin: InkPlugin): Promise<string> => {
    let baseAttachmentPath: string = '';

    const customSettingsWithObsFolder = plugin.settings.customAttachmentFolders && plugin.settings.useObsidianAttachmentFolder;
    const defaultSettingsWithObsFolder = !plugin.settings.customAttachmentFolders && DEFAULT_SETTINGS.useObsidianAttachmentFolder;
    if (customSettingsWithObsFolder || defaultSettingsWithObsFolder) {

        try {
            const returnedObsPath = await plugin.app.fileManager.getAvailablePathForAttachment('dummy');
            if (returnedObsPath.contains('/')) {
                const { folderpath } = parseFilepath(returnedObsPath);
                baseAttachmentPath = folderpath;
            }
        } catch (err) {
            console.warn(err);
            new Notice(`Ink Plugin: There was an error accessing the default Obsidian attachment folder. Placing the new file at in the root of your vault or according to your other settings.`, 0);
        }

    } else {
        baseAttachmentPath = '';
    }

    return baseAttachmentPath;
};
