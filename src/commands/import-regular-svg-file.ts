import { Editor, Notice, TFile } from "obsidian";
import InkPlugin from "src/main";
import { buildDrawingEmbed } from "src/components/formats/current/utils/build-embeds";
import { SvgFilePickerModal } from "src/components/dom-components/modals/svg-picker-modal/svg-picker-modal";

/////////
/////////

/**
 * 导入SVG文件（包括常规SVG和Ink格式SVG）
 * 这个命令会显示所有SVG文件，选择后直接插入嵌入代码
 * 真正的转换在drawing-view.tsx打开编辑器时进行
 */
export const importRegularSvgFile = async (plugin: InkPlugin, editor: Editor) => {
    // 获取所有SVG文件
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
            
            // 显示所有有效的SVG文件（包括常规SVG和Ink格式SVG）
            validFiles.push(file);
        } catch (_) {
            // ignore invalid/unreadable files
        }
    }

    if (validFiles.length === 0) {
        new Notice('No SVG files found');
        return;
    }

    new SvgFilePickerModal(plugin.app, {
        title: 'Import SVG file',
        files: validFiles,
        onChoose: async (file: TFile) => {
            try {
                // 直接构建嵌入字符串，不进行转换
                // 转换将在drawing-view.tsx打开编辑器时自动进行
                const embedStr = buildDrawingEmbed(file.path);
                editor.replaceRange(embedStr, editor.getCursor());
                
                new Notice('SVG file imported successfully');
            } catch (error) {
                console.error('Error importing SVG file:', error);
                new Notice('Error importing SVG file');
            }
        }
    }).open();
}