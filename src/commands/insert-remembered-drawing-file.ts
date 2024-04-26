import InkPlugin from "src/main";
import { Editor, Notice, TFile } from "obsidian";
import { buildDrawingEmbed } from "src/utils/embed";
import createNewDrawingFile from "./create-new-drawing-file";
import { PLUGIN_KEY } from "src/constants";
import { fetchLocally } from "src/utils/storage";

//////////
//////////

const insertRememberedDrawingFile = async (plugin: InkPlugin, editor: Editor) => {
    const v = plugin.app.vault;

    const existingFilePath = fetchLocally('rememberedDrawingFile');
    if(!existingFilePath) {
        new Notice('Copy a drawing embed first.');
        return;
    }

    const existingFileRef = v.getAbstractFileByPath(existingFilePath) as TFile;
    if(!(existingFileRef instanceof TFile)) {
        new Notice('Cannot insert.\nCopied drawing file no longer exists.');
        return;
    }

    let fileToInsert: TFile;
    // If insert existing
    fileToInsert = existingFileRef
    // If insert duplicate
    // fileToInsert = await duplicateDrawingFile(plugin, existingFileRef);

    let embedStr = buildDrawingEmbed(fileToInsert.path);
    editor.replaceRange( embedStr, editor.getCursor() );
}

export default insertRememberedDrawingFile;