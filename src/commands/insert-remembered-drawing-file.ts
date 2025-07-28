import InkPlugin from "src/main";
import { Editor, Notice, TFile } from "obsidian";
import { buildDrawingEmbed } from "src/logic/utils/embed";
import { fetchLocally } from "src/logic/utils/storage";
import { InsertCopiedFileModal } from "src/components/dom-components/modals/confirmation-modal/insert-copied-file-modal";
import { duplicateDrawingFile } from "src/logic/utils/rememberDrawingFile";

//////////
//////////

const insertRememberedDrawingFile = async (plugin: InkPlugin, editor: Editor) => {
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
            let embedStr = buildDrawingEmbed(existingFileRef.path);
            editor.replaceRange(embedStr, editor.getCursor());
        },
        duplicateAction: async () => {
            const activeFile = plugin.app.workspace.getActiveFile();
            const duplicatedFileRef = await duplicateDrawingFile(plugin, existingFileRef, activeFile);
            if(!duplicatedFileRef) return;

            new Notice("Drawing file duplicated");
            let embedStr = buildDrawingEmbed(duplicatedFileRef.path);
            editor.replaceRange(embedStr, editor.getCursor());
        },
        cancelAction: () => {
            new Notice('Insert cancelled.');
        }
    }).open();
    
}

export default insertRememberedDrawingFile;