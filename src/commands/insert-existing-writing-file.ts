import { Editor, TFile } from "obsidian";
import InkPlugin from "src/main";
import { buildWritingEmbed } from "src/components/formats/current/utils/build-embeds";
import { openInkFilePicker } from "src/logic/utils/open-ink-file-picker";

////////
////////

export const insertExistingWritingFile = async (plugin: InkPlugin, editor: Editor) => {
    const sourceFile = plugin.app.workspace.getActiveFile();
    const noteContent = editor.getValue();
    await openInkFilePicker(plugin, 'inkWriting', 'Select writing', (file: TFile) => {
        const embedStr = buildWritingEmbed(file.path, { pendingPaste: true });
        editor.replaceRange(embedStr, editor.getCursor());
    }, { sourceFile, noteContent });
}
