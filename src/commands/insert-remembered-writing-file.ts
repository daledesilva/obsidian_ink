import InkPlugin from "src/main";
import { Editor, Notice, TFile } from "obsidian";
import { buildWritingEmbed } from "src/utils/embed";
import { fetchLocally } from "src/utils/storage";
import { duplicateWritingFile } from "src/utils/rememberDrawingFile";
import { InsertCopiedFileModal } from "src/modals/confirmation-modal/insert-copied-file-modal";

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


    new InsertCopiedFileModal({
        plugin,
        filetype: 'writing',
        instanceAction: () => {
            let embedStr = buildWritingEmbed(existingFileRef.path);
            editor.replaceRange(embedStr, editor.getCursor());
        },
        duplicateAction: async () => {
            const duplicatedFileRef = await duplicateWritingFile(plugin, existingFileRef);
            if(!duplicatedFileRef) return;

            new Notice("Writing file duplicated");
            let embedStr = buildWritingEmbed(duplicatedFileRef.path);
            editor.replaceRange(embedStr, editor.getCursor());
        },
        cancelAction: () => {
            new Notice('Insert cancelled.');
        }
    }).open();

}

export default insertRememberedWritingFile;