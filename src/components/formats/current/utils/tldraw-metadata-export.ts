import { Editor, TLShapeId } from 'tldraw';

/**
 * 生成纯SVG字符串，与官方tldraw导出格式一致
 * 只保留纯SVG内容，添加XML声明、DOCTYPE声明和正确的xlink:href
 * @param editor tldraw编辑器实例
 * @param selectedShapeIds 可选参数，指定要导出的形状ID数组，如果为空则使用当前选择
 * @returns 纯SVG字符串
 */
export async function getDrawingSvgWithMetadata(editor: Editor, selectedShapeIds?: string[]): Promise<string> {
    // 判断是否有框选元素：优先使用传入的selectedShapeIds，如果没有则使用编辑器的当前选择
    let shapeIds: TLShapeId[];
    
    if (selectedShapeIds && selectedShapeIds.length > 0) {
        // 使用传入的指定形状ID，转换为TLShapeId类型
        shapeIds = selectedShapeIds as TLShapeId[];
    } else {
        // 获取当前选择的形状ID
        const currentSelection = editor.getSelectedShapeIds();
        
        if (currentSelection.length > 0) {
            // 有框选元素，仅导出框选元素
            shapeIds = currentSelection;
        } else {
            // 没有框选元素，默认导出全部元素
            shapeIds = Array.from(editor.getCurrentPageShapeIds().values());
        }
    }
    
    if (shapeIds.length === 0) {
        throw new Error('No shapes available for export');
    }
    
    // 获取基础的SVG字符串
    const svgObj = await editor.getSvgString(shapeIds);
    
    if (!svgObj?.svg) {
        throw new Error('Failed to generate SVG');
    }
    
    let svgString = svgObj.svg;
    
    // 修复SVG内容：将href替换为xlink:href以符合SVG 1.1规范
    svgString = svgString.replace(/<image([^>]*)href=/g, '<image$1xlink:href=');
    
    // 确保SVG包含必要的命名空间声明
    const hasCorrectXlinkNs = svgString.includes('xmlns:xlink="http://www.w3.org/1999/xlink"');
    const hasEmptyXlinkNs = svgString.includes('xmlns:xlink=""');
    
    if (!hasCorrectXlinkNs) {
        // 如果存在空的xlink命名空间，先移除
        if (hasEmptyXlinkNs) {
            svgString = svgString.replace('xmlns:xlink=""', '');
        }
        
        // 添加正确的xlink命名空间声明
        if (svgString.includes('<svg ')) {
            svgString = svgString.replace('<svg ', '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ');
        } else if (svgString.includes('<svg>')) {
            svgString = svgString.replace('<svg>', '<svg xmlns:xlink="http://www.w3.org/1999/xlink">');
        }
    }
    
    // 确保有XML声明和DOCTYPE
    if (!svgString.includes('<?xml')) {
        svgString = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + 
            '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' + 
            svgString;
    }
    
    return svgString;
}

/**
 * 复制纯SVG到剪贴板
 * @param editor tldraw编辑器实例
 */
export async function copyAsSvgWithMetadata(editor: Editor, selectedShapeIds?: string[]): Promise<void> {
    try {
        const shapeIds = selectedShapeIds || Array.from(editor.getCurrentPageShapeIds().values());
        
        if (shapeIds.length === 0) {
            console.warn('No shapes selected for export');
            return;
        }
        
        // 临时选择指定的形状
        const originalSelection = editor.getSelectedShapeIds();
        editor.setSelectedShapes(shapeIds as TLShapeId[]);
        
        // 生成纯SVG
        const svgString = await getDrawingSvgWithMetadata(editor);
        
        // 恢复原始选择
        editor.setSelectedShapes(originalSelection as TLShapeId[]);
        
        // 复制到剪贴板
        await navigator.clipboard.writeText(svgString);
        
        console.log('SVG copied to clipboard');
    } catch (error) {
        console.error('Failed to copy SVG:', error);
        throw error;
    }
}

/**
 * 下载纯SVG文件
 * @param editor tldraw编辑器实例
 * @param filename 文件名（可选）
 * @param selectedShapeIds 可选参数，指定要导出的形状ID数组，如果为空则使用当前选择
 */
export async function downloadSvgWithMetadata(editor: Editor, filename: string = 'drawing.svg', selectedShapeIds?: string[]): Promise<void> {
    try {
        const svgString = await getDrawingSvgWithMetadata(editor, selectedShapeIds);
        
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        
        console.log('SVG downloaded');
  } catch (error) {
    console.error('Failed to download SVG:', error);
    throw error;
  }
}