import InkPlugin from 'src/main';
import { Editor, Notice, TFile } from 'obsidian';
import { buildDrawingEmbed, buildWritingEmbed } from 'src/components/formats/current/utils/build-embeds';
import { buildFileStr, buildFileStrWithDrawingContent, buildFileStrWithWritingContent } from "src/components/formats/current/utils/buildFileStr";
import { buildDrawingFileData, buildWritingFileData } from 'src/components/formats/current/utils/build-file-data';
import { getInkFileData } from 'src/components/formats/v1-code-blocks/utils/getInkFileData';
import { createFoldersForFilepath } from 'src/logic/utils/createFoldersForFilepath';
import { getNewTimestampedDrawingSvgFilepath, getNewTimestampedWritingSvgFilepath } from 'src/logic/utils/file-manipulation';
import { DRAW_EMBED_KEY, WRITE_EMBED_KEY } from 'src/constants';
import { prepareDrawingSnapshot, prepareWritingSnapshot } from 'src/components/formats/current/utils/tldraw-helpers';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';

// 定义v1版本嵌入数据的类型
interface DrawingEmbedData_v1 {
    versionAtEmbed: string;
    filepath: string;
    width?: number;
    aspectRatio?: number;
}

interface WritingEmbedData_v1 {
    versionAtEmbed: string;
    filepath: string;
    transcript?: string;
}

// 健壮的V1文件数据读取函数（增强版）
async function getRobustInkFileData(plugin: InkPlugin, file: TFile): Promise<any> {
    const v = plugin.app.vault;
    
    // 添加重试机制
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const fileContent = await v.read(file);
            
            // 首先尝试直接解析JSON（适用于纯JSON格式的V1文件）
            try {
                const jsonData = JSON.parse(fileContent);
                if (jsonData && jsonData.meta && jsonData.tldraw) {
                    return jsonData;
                }
            } catch (jsonError) {
                // JSON解析失败，继续尝试其他格式
            }
            
            // 如果文件是SVG格式，尝试从中提取JSON数据
            if (file.extension.toLowerCase() === 'svg') {
                // 检查是否包含SVG标签（考虑XML声明和DOCTYPE的情况）
                const trimmedContent = fileContent.trim();
                const hasSvgTag = trimmedContent.includes('<svg') && trimmedContent.includes('</svg>');
                if (hasSvgTag) {
                    const svgData = extractInkJsonFromSvg(fileContent);
                    if (svgData) {
                        return svgData;
                    }
                }
            }
            
            // 如果以上方法都失败，尝试更宽松的JSON解析
            try {
                // 尝试清理可能的格式问题
                const cleanedContent = fileContent.trim();
                // 移除可能的BOM字符
                const bomFreeContent = cleanedContent.replace(/^\uFEFF/, '');
                const jsonData = JSON.parse(bomFreeContent);
                return jsonData;
            } catch (finalError) {
                // 最后一次尝试失败才抛出错误
                if (attempt === 3) {
                    console.error('Failed to parse V1 file in any format after 3 attempts:', finalError);
                    throw new Error(`无法解析V1文件: ${file.path}`);
                }
                // 等待一段时间后重试
                await new Promise(resolve => setTimeout(resolve, 100 * attempt));
            }
        } catch (readError) {
            if (attempt === 3) {
                console.error('Failed to read file after 3 attempts:', readError);
                throw new Error(`无法读取文件: ${file.path}`);
            }
            // 等待一段时间后重试
            await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        }
    }
    
    throw new Error('Unexpected error in getRobustInkFileData');
}

export const convertV1EmbedsToCurrent = async (plugin: InkPlugin, editor: Editor) => {
    const activeFile = plugin.app.workspace.getActiveFile();
    if (!activeFile) {
        new Notice('No active file found');
        return;
    }

    try {
        // 获取当前文档内容
        const docContent = await plugin.app.vault.read(activeFile);
        
        // 查找所有v1版本的嵌入代码块
        const drawingEmbedRegex = new RegExp('```' + DRAW_EMBED_KEY + '\\s*([\\s\\S]*?)\\s*```', 'g');
        const writingEmbedRegex = new RegExp('```' + WRITE_EMBED_KEY + '\\s*([\\s\\S]*?)\\s*```', 'g');
        
        // 存储所有需要替换的嵌入代码块
        const replacements: Array<{
            start: number;
            end: number;
            newContent: string;
        }> = [];
        
        // 处理绘图嵌入代码块
        let match: RegExpExecArray | null;
        while ((match = drawingEmbedRegex.exec(docContent)) !== null) {
            try {
                // 解析嵌入数据
                const embedData: DrawingEmbedData_v1 = JSON.parse(match[1]);
                
                // 检查文件是否存在
                const v1File = plugin.app.vault.getAbstractFileByPath(embedData.filepath);
                if (!v1File || !(v1File instanceof TFile)) {
                    console.warn(`File not found: ${embedData.filepath}`);
                    continue;
                }
                
                // 读取v1版本文件数据（使用健壮的读取函数）
                const v1FileData = await getRobustInkFileData(plugin, v1File);
                
                // 创建current版本SVG文件路径
                const svgFilepath = await getNewTimestampedDrawingSvgFilepath(plugin, activeFile);
                await createFoldersForFilepath(plugin, svgFilepath);
                
                // 构建current版本文件数据
                const preparedSnapshot = prepareDrawingSnapshot(v1FileData.tldraw);
                const currentFileData = buildDrawingFileData({
                    tlEditorSnapshot: preparedSnapshot,
                });
                
                // 创建SVG文件 - 使用包含实际绘图内容的SVG生成函数
                const svgContent = await buildFileStrWithDrawingContent(currentFileData);
                const svgFile = await plugin.app.vault.create(svgFilepath, svgContent);
                
                // 构建新的嵌入字符串
                const newEmbedStr = buildDrawingEmbed(svgFilepath);
                
                // 存储替换信息（注意需要反向排序，从后往前替换，避免位置偏移）
                replacements.push({
                    start: match.index,
                    end: match.index + match[0].length,
                    newContent: newEmbedStr
                });
                
            } catch (error) {
                console.error('Error processing drawing embed:', error);
                continue;
            }
        }
        
        // 处理写作嵌入代码块
        while ((match = writingEmbedRegex.exec(docContent)) !== null) {
            try {
                // 解析嵌入数据
                const embedData: WritingEmbedData_v1 = JSON.parse(match[1]);
                
                // 检查文件是否存在
                const v1File = plugin.app.vault.getAbstractFileByPath(embedData.filepath);
                if (!v1File || !(v1File instanceof TFile)) {
                    console.warn(`File not found: ${embedData.filepath}`);
                    continue;
                }
                
                // 读取v1版本文件数据（使用健壮的读取函数）
                const v1FileData = await getRobustInkFileData(plugin, v1File);
                
                // 创建current版本SVG文件路径
                const svgFilepath = await getNewTimestampedWritingSvgFilepath(plugin, activeFile);
                await createFoldersForFilepath(plugin, svgFilepath);
                
                // 构建current版本文件数据
                const preparedSnapshot = prepareWritingSnapshot(v1FileData.tldraw);
                const currentFileData = buildWritingFileData({
                    tlEditorSnapshot: preparedSnapshot,
                    transcript: v1FileData.meta.transcript,
                });
                
                // 创建SVG文件 - 使用包含实际写作内容的SVG生成函数
                const svgContent = await buildFileStrWithWritingContent(currentFileData);
                const svgFile = await plugin.app.vault.create(svgFilepath, svgContent);
                
                // 构建新的嵌入字符串
                const newEmbedStr = buildWritingEmbed(svgFilepath);
                
                // 存储替换信息
                replacements.push({
                    start: match.index,
                    end: match.index + match[0].length,
                    newContent: newEmbedStr
                });
                
            } catch (error) {
                console.error('Error processing writing embed:', error);
                continue;
            }
        }
        
        // 按开始位置从大到小排序，确保从后往前替换
        replacements.sort((a, b) => b.start - a.start);
        
        // 执行替换
        let newDocContent = docContent;
        for (const replacement of replacements) {
            newDocContent = newDocContent.substring(0, replacement.start) + 
                            replacement.newContent + 
                            newDocContent.substring(replacement.end);
        }
        
        // 如果有替换，更新文档
        if (replacements.length > 0) {
            await plugin.app.vault.modify(activeFile, newDocContent);
            new Notice(`Converted ${replacements.length} embed(s) to current format`);
        } else {
            new Notice('No v1 embeds found to convert');
        }
        
    } catch (error) {
        console.error('Error converting v1 embeds:', error);
        new Notice('Failed to convert v1 embeds. Check console for details.');
    }
}