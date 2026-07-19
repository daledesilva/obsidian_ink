import { Editor, TFile } from "obsidian";
import InkPlugin from "src/main";
import { buildDrawingEmbed } from "src/components/formats/current/utils/build-embeds";
import { buildDrawingEmbedSettingsFromFile } from "src/logic/utils/build-drawing-embed-settings-from-file";
import { openInkFilePicker } from "src/logic/utils/open-ink-file-picker";

/////////
/////////

export const insertExistingDrawingFile = async (plugin: InkPlugin, editor: Editor) => {
    const sourceFile = plugin.app.workspace.getActiveFile();
    const noteContent = editor.getValue();
    await openInkFilePicker(plugin, 'inkDrawing', 'Select drawing', async (file: TFile) => {
        const embedSettings = await buildDrawingEmbedSettingsFromFile(plugin, file);
        const embedStr = buildDrawingEmbed(file.path, {
            pendingPaste: true,
            embedSettings,
        });
        editor.replaceRange(embedStr, editor.getCursor());
    }, { sourceFile, noteContent });
}
