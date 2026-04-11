import { TFile } from "obsidian";
import { getGlobals } from "src/stores/global-store";
import { logToVault } from "src/logic/utils/log-to-vault";

///////////////////////////
///////////////////////////

export const saveSvg = async (dataUri: string, filepath: string): Promise<void> => {
    const { plugin } = getGlobals();
    const v = plugin.app.vault;

    try {
        const file = v.getAbstractFileByPath(filepath) as TFile;

        if (file && file instanceof TFile) {
            v.modify(file, dataUri);
            logToVault('saveSvg (modify): ' + filepath);
        } else {
            v.create(filepath, dataUri);
            logToVault('saveSvg (create): ' + filepath);
        }

    } catch (error) {
        logToVault('saveSvg ERROR: ' + filepath + ' – ' + String(error));
        console.error("Error saving SVG file", error);
    }
};
