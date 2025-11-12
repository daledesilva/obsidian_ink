import { Editor, Notice, TFile } from "obsidian";
import InkPlugin from "src/main";
import { buildDrawingEmbed } from "src/components/formats/current/utils/build-embeds";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";
import { SvgFilePickerModal } from "src/components/dom-components/modals/svg-picker-modal/svg-picker-modal";

/////////
/////////

interface LibraryData {
  libraryFiles: string[];
}

// 获取或初始化Library数据
export const getLibraryData = async (plugin: InkPlugin): Promise<LibraryData> => {
  try {
    const data = await plugin.loadData();
    if (data && data.libraryFiles) {
      return { libraryFiles: data.libraryFiles };
    }
  } catch (error) {
    console.error('Failed to load library data:', error);
  }
  
  // 返回默认的空数据
  return { libraryFiles: [] };
};

// 保存Library数据
export const saveLibraryData = async (plugin: InkPlugin, data: LibraryData): Promise<void> => {
  try {
    const currentData = await plugin.loadData() || {};
    const newData = { ...currentData, libraryFiles: data.libraryFiles };
    await plugin.saveData(newData);
  } catch (error) {
    console.error('Failed to save library data:', error);
    throw error;
  }
};

// 添加文件到素材库
export const addFileToLibrary = async (plugin: InkPlugin, filePath: string): Promise<void> => {
  const libraryData = await getLibraryData(plugin);
  
  // 检查文件是否已经在素材库中
  if (!libraryData.libraryFiles.includes(filePath)) {
    libraryData.libraryFiles.push(filePath);
    await saveLibraryData(plugin, libraryData);
    new Notice(`已添加到素材库: ${filePath}`);
  } else {
    new Notice('文件已在素材库中');
  }
};

// 从素材库移除文件
export const removeFileFromLibrary = async (plugin: InkPlugin, filePath: string): Promise<void> => {
  const libraryData = await getLibraryData(plugin);
  
  const index = libraryData.libraryFiles.indexOf(filePath);
  if (index > -1) {
    libraryData.libraryFiles.splice(index, 1);
    await saveLibraryData(plugin, libraryData);
    new Notice(`已从素材库移除: ${filePath}`);
  }
};

// Library命令主函数
export const library = async (plugin: InkPlugin, editor: Editor) => {
  // 获取素材库数据
  const libraryData = await getLibraryData(plugin);
  
  if (libraryData.libraryFiles.length === 0) {
    new Notice('素材库为空，请先添加文件到素材库');
    return;
  }

  // 只获取素材库中保存的文件
  const allFiles = plugin.app.vault.getFiles();
  const libraryFiles: TFile[] = [];

  // 验证素材库中的文件是否存在且有效
   for (let i = 0; i < libraryData.libraryFiles.length; i++) {
     const filePath = libraryData.libraryFiles[i];
     const file = allFiles.find(f => f.path === filePath);
     
     if (!file) {
       console.log(`文件不存在: ${filePath}`);
       continue;
     }
     
     if (file.extension !== 'svg') {
       console.log(`文件不是SVG格式: ${filePath}`);
       continue;
     }
     
     try {
       const svgString = await plugin.app.vault.read(file);
        if (!svgString) {
          console.log(`文件内容为空: ${filePath}`);
          continue;
        }
        
        // 检查是否包含SVG标签（考虑XML声明和DOCTYPE的情况）
        const trimmedContent = svgString.trim();
        const hasSvgTag = trimmedContent.includes('<svg') && trimmedContent.includes('</svg>');
        if (!hasSvgTag) {
          console.log(`文件内容无效，不包含SVG标签: ${filePath}`);
          continue;
        }
       
       const inkFileData = extractInkJsonFromSvg(svgString);
       if (!inkFileData) {
         console.log(`无法提取ink数据: ${filePath}`);
         continue;
       }
       
       if (inkFileData.meta.fileType === "inkDrawing") {
         libraryFiles.push(file);
         console.log(`成功添加文件到素材库列表: ${filePath}`);
       } else {
         console.log(`文件类型不是inkDrawing: ${filePath}, 类型: ${inkFileData.meta.fileType}`);
       }
     } catch (error) {
       console.log(`读取文件失败: ${filePath}`, error);
     }
   }

   console.log(`素材库文件总数: ${libraryData.libraryFiles.length}, 有效文件数: ${libraryFiles.length}`);
   
   if (libraryFiles.length === 0) {
     new Notice('素材库中没有有效的drawing SVG文件');
     return;
   }

  // 创建自定义的文件选择器，只显示素材库文件
  new SvgFilePickerModal(plugin.app, {
    title: '素材库 - 选择drawing',
    files: libraryFiles,
    onChoose: (file: TFile) => {
      const embedStr = buildDrawingEmbed(file.path);
      editor.replaceRange(embedStr, editor.getCursor());
    },
    // 添加自定义渲染逻辑，标记所有文件为素材库文件
    customRender: (file: TFile, card: HTMLDivElement) => {
      card.style.border = '2px solid var(--interactive-accent)';
      card.style.boxShadow = '0 0 8px var(--interactive-accent-hover)';
      
      // 添加素材库标记
      const libraryBadge = card.createDiv({ cls: 'ink-library-badge' });
      libraryBadge.style.position = 'absolute';
      libraryBadge.style.top = '8px';
      libraryBadge.style.right = '8px';
      libraryBadge.style.background = 'var(--interactive-accent)';
      libraryBadge.style.color = 'white';
      libraryBadge.style.padding = '2px 6px';
      libraryBadge.style.borderRadius = '4px';
      libraryBadge.style.fontSize = '10px';
      libraryBadge.style.fontWeight = 'bold';
      libraryBadge.textContent = '素材库';
    }
  }).open();
};