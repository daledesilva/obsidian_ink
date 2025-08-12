import InkPlugin from 'src/main';
import { Editor, Notice, TFile } from 'obsidian';
import { fetchLocally } from 'src/logic/utils/storage';
import { InsertCopiedFileModal } from 'src/components/dom-components/modals/confirmation-modal/insert-copied-file-modal';
import { duplicateWritingFile } from 'src/logic/utils/rememberDrawingFile';
import { buildWritingEmbed_v2 } from 'src/logic/utils/embed';

const insertRememberedWritingFileV2 = async (plugin: InkPlugin, editor: Editor) => {
    const v = plugin.app.vault;

    const existingFilePath = fetchLocally('rememberedWritingFile');
    if (!existingFilePath || typeof existingFilePath !== 'string') {
        new Notice('Copy a writing embed first.');
        return;
    }

    const existingFileRef = v.getAbstractFileByPath(existingFilePath) as TFile;
    if (!(existingFileRef instanceof TFile)) {
        new Notice('Cannot insert.\nCopied writing file no longer exists.');
        return;
    }

    new InsertCopiedFileModal({
        plugin,
        filetype: 'writing',
        instanceAction: () => {
            const embedStr = buildWritingEmbed_v2(existingFileRef.path);
            editor.replaceRange(embedStr, editor.getCursor());
        },
        duplicateAction: async () => {
            const activeFile = plugin.app.workspace.getActiveFile();
            const duplicatedFileRef = await duplicateWritingFile(plugin, existingFileRef, activeFile);
            if (!duplicatedFileRef) return;

            new Notice('Writing file duplicated');
            const embedStr = buildWritingEmbed_v2(duplicatedFileRef.path);
            editor.replaceRange(embedStr, editor.getCursor());
        },
        cancelAction: () => {
            new Notice('Insert cancelled.');
        },
    }).open();
};

export default insertRememberedWritingFileV2;


