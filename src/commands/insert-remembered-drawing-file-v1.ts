import InkPlugin from "src/main";
import { Editor, Notice, TFile } from "obsidian";
import { buildDrawingEmbed_v1 } from "src/components/formats/v1-code-blocks/utils/build-embeds";
import { fetchLocally } from "src/logic/utils/storage";
import { InsertCopiedFileModal } from "src/components/dom-components/modals/confirmation-modal/insert-copied-file-modal";
import { duplicateDrawingFile_v1 } from "src/components/formats/v1-code-blocks/utils/duplicate-files";

//////////
//////////

export const insertRememberedDrawingFile_v1 = async (plugin: InkPlugin, editor: Editor) => {
    const v = plugin.app.vault;

    const existingFilePath = fetchLocally('rememberedDrawingFile');
    if (!existingFilePath || typeof existingFilePath !== 'string') {
        new Notice('Copy a drawing embed first.');
        return;
    }

    const existingFileRef = v.getAbstractFileByPath(existingFilePath) as TFile;
    if (!(existingFileRef instanceof TFile)) {
        new Notice('Cannot insert.\nCopied drawing file no longer exists.');
        return;
    }

    new InsertCopiedFileModal({
        plugin,
        filetype: 'drawing',
        instanceAction: () => {
            let embedStr = buildDrawingEmbed_v1(existingFileRef.path);
            editor.replaceRange(embedStr, editor.getCursor());
        },
        duplicateAction: async () => {
            const activeFile = plugin.app.workspace.getActiveFile();
            const duplicatedFileRef = await duplicateDrawingFile_v1(plugin, existingFileRef, activeFile);
            if(!duplicatedFileRef) return;

            new Notice("Drawing file duplicated");
            let embedStr = buildDrawingEmbed_v1(duplicatedFileRef.path);
            editor.replaceRange(embedStr, editor.getCursor());
        },
        cancelAction: () => {
            new Notice('Insert cancelled.');
        }
    }).open();
    
}