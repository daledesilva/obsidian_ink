import { Notice, TFile } from "obsidian";
import InkPlugin from "src/main";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";
import { SvgFilePickerModal } from "src/components/dom-components/modals/svg-picker-modal/svg-picker-modal";

////////
////////

export async function openInkFilePicker(
    plugin: InkPlugin,
    fileType: 'inkWriting' | 'inkDrawing',
    title: string,
    onChoose: (file: TFile) => void
): Promise<void> {
    const allFiles = plugin.app.vault.getFiles();
    const svgFiles = allFiles.filter(file => file.extension === 'svg');
    const validFiles: TFile[] = [];

    for (let i = 0; i < svgFiles.length; i++) {
        const file = svgFiles[i];
        try {
            const svgString = await plugin.app.vault.read(file);
            if (!svgString || !svgString.trim().startsWith('<svg')) continue;
            const inkFileData = extractInkJsonFromSvg(svgString);
            if (!inkFileData) continue;
            if (inkFileData.meta.fileType === fileType) validFiles.push(file);
        } catch (_) {
            // ignore invalid/unreadable files
        }
    }

    const fileTypeLabel = fileType === 'inkWriting' ? 'writing' : 'drawing';
    if (validFiles.length === 0) {
        new Notice(`No ${fileTypeLabel} SVGs found`);
        return;
    }

    new SvgFilePickerModal(plugin.app, {
        title,
        files: validFiles,
        onChoose,
    }).open();
}
