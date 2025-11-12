import { Editor, Notice, TFile } from "obsidian";
import InkPlugin from "src/main";
import { buildWritingEmbed } from "src/components/formats/current/utils/build-embeds";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";
import { SvgFilePickerModal } from "src/components/dom-components/modals/svg-picker-modal/svg-picker-modal";

////////
////////

export const insertExistingWritingFile = async (plugin: InkPlugin, editor: Editor) => {
    // Build a list of valid handwriting SVGs before opening the modal
    const allFiles = plugin.app.vault.getFiles();
    const svgFiles = allFiles.filter(f => f.extension === 'svg');
    const validFiles: TFile[] = [];

    for (let i = 0; i < svgFiles.length; i++) {
        const file = svgFiles[i];
        try {
            const svgString = await plugin.app.vault.read(file);
            if (!svgString) continue;
            
            // 检查是否包含SVG标签（考虑XML声明和DOCTYPE的情况）
            const trimmedContent = svgString.trim();
            const hasSvgTag = trimmedContent.includes('<svg') && trimmedContent.includes('</svg>');
            if (!hasSvgTag) continue;
            
            const inkFileData = extractInkJsonFromSvg(svgString);
            if (!inkFileData) continue;
            if (inkFileData.meta.fileType === "inkWriting") validFiles.push(file);
        } catch (_) {
            // ignore invalid/unreadable files
        }
    }

    if (validFiles.length === 0) {
        new Notice('No writing SVGs found');
        return;
    }

    new SvgFilePickerModal(plugin.app, {
        title: 'Select writing',
        files: validFiles,
        onChoose: (file: TFile) => {
            const embedStr = buildWritingEmbed(file.path);
            editor.replaceRange(embedStr, editor.getCursor());
        }
    }).open();
}

