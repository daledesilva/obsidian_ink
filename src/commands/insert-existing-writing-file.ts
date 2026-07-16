import { Editor, TFile } from "obsidian";
import InkPlugin from "src/main";
import { buildWritingEmbed } from "src/components/formats/current/utils/build-embeds";
import { openInkFilePicker } from "src/logic/utils/open-ink-file-picker";
import { readWritingFileAspectRatio } from "src/logic/utils/writing-embed-aspect-ratio";

////////
////////

export const insertExistingWritingFile = async (plugin: InkPlugin, editor: Editor) => {
    const sourceFile = plugin.app.workspace.getActiveFile();
    const noteContent = editor.getValue();
    await openInkFilePicker(plugin, 'inkWriting', 'Select writing', async (file: TFile) => {
        const aspectRatio = await readWritingFileAspectRatio(plugin, file);
        const embedStr = buildWritingEmbed(file.path, {
            pendingPaste: true,
            ...(aspectRatio != null ? { aspectRatio } : {}),
        });
        editor.replaceRange(embedStr, editor.getCursor());
    }, { sourceFile, noteContent });
}
