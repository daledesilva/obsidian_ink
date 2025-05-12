import { TFile } from "obsidian";
import { getGlobals } from "src/stores/global-store";

///////////////////////////
///////////////////////////

export const saveSvg = async (dataUri: string, filepath: string): Promise<void> => {
    const { plugin } = getGlobals();
    const v = plugin.app.vault;

    try {
        const file = v.getAbstractFileByPath(filepath) as TFile;

        if (file && file instanceof TFile) {
            v.modify(file, dataUri);
        } else {
            v.create(filepath, dataUri);
        }

    } catch (error) {
        console.error("Error saving SVG file", error);
    }
};
