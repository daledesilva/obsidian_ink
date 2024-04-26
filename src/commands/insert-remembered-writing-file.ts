import InkPlugin from "src/main";
import { Editor, Notice, TFile } from "obsidian";
import { buildWritingEmbed } from "src/utils/embed";
import { fetchLocally } from "src/utils/storage";
import { duplicateWritingFile } from "src/utils/file-manipulation";

//////////
//////////

const insertRememberedWritingFile = async (plugin: InkPlugin, editor: Editor) => {
    const v = plugin.app.vault;

    const existingFilePath = fetchLocally('rememberedWritingFile');
    if(!existingFilePath) {
        new Notice('Copy a writing embed first.');
        return;
    }

    const existingFileRef = v.getAbstractFileByPath(existingFilePath) as TFile;
    if(!(existingFileRef instanceof TFile)) {
        new Notice('Cannot insert.\nCopied writing file no longer exists.');
        return;
    }

    let fileToInsert: TFile;
    // If insert existing
    fileToInsert = existingFileRef
    // If insert duplicate
    // fileToInsert = await duplicateWritingFile(plugin, existingFileRef);

    let embedStr = buildWritingEmbed(fileToInsert.path);
    editor.replaceRange( embedStr, editor.getCursor() );
}

export default insertRememberedWritingFile;