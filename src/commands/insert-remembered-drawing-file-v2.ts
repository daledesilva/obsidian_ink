import InkPlugin from "src/main";
import { Editor, Notice, TFile } from "obsidian";
import { fetchLocally } from "src/logic/utils/storage";
import { InsertCopiedFileModal } from "src/components/dom-components/modals/confirmation-modal/insert-copied-file-modal";
import { duplicateDrawingFileV2 } from "src/logic/utils/rememberDrawingFile";
import { buildDrawingEmbedV2 } from "src/logic/utils/embed";

//////////
//////////

const insertRememberedDrawingFileV2 = async (plugin: InkPlugin, editor: Editor) => {
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
            const embedStr = buildDrawingEmbedV2(existingFileRef.path);
            editor.replaceRange(embedStr, editor.getCursor());
        },
        duplicateAction: async () => {
            const activeFile = plugin.app.workspace.getActiveFile();
            const duplicatedFileRef = await duplicateDrawingFileV2(plugin, existingFileRef, activeFile);
            if (!duplicatedFileRef) return;

            new Notice("Drawing file duplicated");
            const embedStr = buildDrawingEmbedV2(duplicatedFileRef.path);
            editor.replaceRange(embedStr, editor.getCursor());
        },
        cancelAction: () => {
            new Notice('Insert cancelled.');
        }
    }).open();
};

export default insertRememberedDrawingFileV2;


