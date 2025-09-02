import InkPlugin from "src/main";
import { Editor, Notice, TFile } from "obsidian";
import { buildWritingEmbed_v1 } from "src/components/formats/v1-code-blocks/utils/build-embeds";
import { fetchLocally } from "src/logic/utils/storage";
import { duplicateWritingFile_v1 } from "src/components/formats/v1-code-blocks/utils/duplicate-files";
import { InsertCopiedFileModal } from "src/components/dom-components/modals/confirmation-modal/insert-copied-file-modal";

//////////
//////////

export const insertRememberedWritingFile_v1 = async (plugin: InkPlugin, editor: Editor) => {
    const v = plugin.app.vault;

    const existingFilePath = fetchLocally('rememberedWritingFile');
    if(!existingFilePath || typeof existingFilePath !== 'string') {
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
            let embedStr = buildWritingEmbed_v1(existingFileRef.path);
            editor.replaceRange(embedStr, editor.getCursor());
        },
        duplicateAction: async () => {
            const activeFile = plugin.app.workspace.getActiveFile();
            const duplicatedFileRef = await duplicateWritingFile_v1(plugin, existingFileRef, activeFile);
            if(!duplicatedFileRef) return;

            new Notice("Writing file duplicated");
            let embedStr = buildWritingEmbed_v1(duplicatedFileRef.path);
            editor.replaceRange(embedStr, editor.getCursor());
        },
        cancelAction: () => {
            new Notice('Insert cancelled.');
        }
    }).open();

}