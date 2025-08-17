import { Editor, Notice, TFile } from "obsidian";
import InkPlugin from "src/main";
import { buildDrawingEmbed } from "src/components/formats/current/utils/build-embeds";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";
import { SvgFilePickerModal } from "src/components/dom-components/modals/svg-picker-modal/svg-picker-modal";

/////////
/////////

export const insertExistingDrawingFile = async (plugin: InkPlugin, editor: Editor) => {
    // Build a list of valid drawing SVGs before opening the modal
    const allFiles = plugin.app.vault.getFiles();
    const svgFiles = allFiles.filter(f => f.extension === 'svg');
    const validFiles: TFile[] = [];

    for (let i = 0; i < svgFiles.length; i++) {
        const file = svgFiles[i];
        try {
            const svgString = await plugin.app.vault.read(file);
            if (!svgString || !svgString.trim().startsWith('<svg')) continue;
            const inkData = extractInkJsonFromSvg(svgString);
            const fileType = (inkData as any)?.meta?.fileType;
            if (inkData && fileType === 'drawing') validFiles.push(file);
        } catch (_) {
            // ignore invalid/unreadable files
        }
    }

    if (validFiles.length === 0) {
        new Notice('No drawing SVGs found');
        return;
    }

    new SvgFilePickerModal(plugin.app, {
        title: 'Select drawing',
        files: validFiles,
        onChoose: (file: TFile) => {
            const embedStr = buildDrawingEmbed(file.path);
            editor.replaceRange(embedStr, editor.getCursor());
        }
    }).open();
}

 
