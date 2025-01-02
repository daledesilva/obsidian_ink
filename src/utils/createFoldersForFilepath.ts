import InkPlugin from "src/main";
import { debug, error } from "./log-to-console";

///////////////////////
///////////////////////

export const createFoldersForFilepath = async (plugin: InkPlugin, filePath: string): Promise<void> => {
    const splitPath = filePath.split('/');
    
    // Remove the filename at the end
    splitPath.pop();

    let prevPath: string[] = [];
    for(let i=0; i<splitPath.length; i++) {
        const folderName = splitPath[i];
        const cascadePath = prevPath.length > 0 ? `${prevPath.join('/')}/${folderName}` : folderName;

        try {
            if (!plugin.app.vault.getAbstractFileByPath(cascadePath)) {
                await plugin.app.vault.createFolder(cascadePath);
                debug(`Created path: ${cascadePath}`);
            }
        } catch (e) {
            error(`Couldn't create attachment folder for ${cascadePath}`, e);
        }

        prevPath.push(folderName);
    };
    
};
