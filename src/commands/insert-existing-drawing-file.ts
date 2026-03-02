import { Editor, TFile } from "obsidian";
import InkPlugin from "src/main";
import { buildDrawingEmbed } from "src/components/formats/current/utils/build-embeds";
import { openInkFilePicker } from "src/logic/utils/open-ink-file-picker";

/////////
/////////

export const insertExistingDrawingFile = async (plugin: InkPlugin, editor: Editor) => {
    const sourceFile = plugin.app.workspace.getActiveFile();
    const noteContent = editor.getValue();
    await openInkFilePicker(plugin, 'inkDrawing', 'Select drawing', (file: TFile) => {
        const embedStr = buildDrawingEmbed(file.path, { pendingPaste: true });
        editor.replaceRange(embedStr, editor.getCursor());
    }, { sourceFile, noteContent });
}
