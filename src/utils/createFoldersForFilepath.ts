import InkPlugin from "src/main";


export const createFoldersForFilepath = async (plugin: InkPlugin, path: string): Promise<void> => {

    // Remove the filename at the end
    const folders = path.split('/');
    folders.pop();

    try {
        await plugin.app.vault.createFolder(folders.join('/'));
    } catch (e) {
        // console.log(e);
    }
};
