import { TLEditorSnapshot, Editor, loadSnapshot, getSnapshot, createTLStore, coreShapes, defaultShapeTools, defaultTools, defaultShapeUtils } from 'tldraw';
import { PLUGIN_VERSION, TLDRAW_VERSION } from '../../../../constants';
import { DOMParser } from 'xmldom';
import format from 'xml-formatter';
import { InkFileData } from '../types/file-data';

//////////////////////////
//////////////////////////


// V2 format: SVG file with JSON metadata embedded
export const buildFileStr = (pageData: InkFileData): string => {
    // Prefer svgString for v2; fall back to previewUri for backward compatibility
    let fileStr = pageData.svgString || '<svg></svg>';

	// 修复SVG内容：将href替换为xlink:href以符合SVG 1.1规范
	let fixedSvgContent = fileStr.replace(/<image([^>]*)href=/g, '<image$1xlink:href=');

	// 确保SVG包含必要的命名空间声明
	const hasCorrectXlinkNs = fixedSvgContent.includes('xmlns:xlink="http://www.w3.org/1999/xlink"');
	const hasEmptyXlinkNs = fixedSvgContent.includes('xmlns:xlink=""');
	
	if (!hasCorrectXlinkNs) {
		// 如果存在空的xlink命名空间，先移除
		if (hasEmptyXlinkNs) {
			fixedSvgContent = fixedSvgContent.replace('xmlns:xlink=""', '');
		}
		
		// 添加正确的xlink命名空间声明
		if (fixedSvgContent.includes('<svg ')) {
			fixedSvgContent = fixedSvgContent.replace('<svg ', '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ');
		} else if (fixedSvgContent.includes('<svg>')) {
			fixedSvgContent = fixedSvgContent.replace('<svg>', '<svg xmlns:xlink="http://www.w3.org/1999/xlink">');
		}
	}

	// Create svg/xml document
	const parser = new DOMParser();
	const doc = parser.parseFromString(fixedSvgContent, 'image/svg+xml');
	const svgElement = doc.documentElement;

	// Prepare tldraw JSON only (no meta in JSON)
	const tldrawJson = pageData.tldraw;

	// Create settings in xml
	const metadataElement = doc.createElement('metadata');

	// <ink> meta with attributes
	const inkMetaElement = doc.createElement('ink');
	inkMetaElement.setAttribute('plugin-version', String(pageData.meta.pluginVersion));
	inkMetaElement.setAttribute('file-type', pageData.meta.fileType);
	metadataElement.appendChild(inkMetaElement);

	// <tldraw version="..."> JSON </tldraw>
	const settingsElement = doc.createElement('tldraw');
	settingsElement.setAttribute('version', String(TLDRAW_VERSION));
	settingsElement.textContent = JSON.stringify(tldrawJson, null, 2);
	metadataElement.appendChild(settingsElement);

	svgElement.appendChild(metadataElement);

	// 构建完整的SVG文件内容，包含XML声明和DOCTYPE
	const svgWithDeclaration = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
${svgElement.toString()}`;

	// 直接返回包含声明的SVG内容，不使用xml-formatter，因为它可能会移除XML声明
	return svgWithDeclaration;
}

// 生成包含实际绘图内容的SVG文件
export async function buildFileStrWithDrawingContent(fileData: InkFileData): Promise<string> {
    try {
        // 创建临时编辑器实例 - 使用正确的构造函数参数
        // 使用defaultShapeUtils而不是coreShapes来避免重复注册核心形状
        const store = createTLStore();
        const editor = new Editor({
            store,
            shapeUtils: defaultShapeUtils, // 使用defaultShapeUtils而不是空数组
            bindingUtils: [],
            tools: [...defaultTools, ...defaultShapeTools],
            getContainer: () => document.createElement('div')
        });
        
        // 加载快照 - 使用正确的loadSnapshot调用方式
        await loadSnapshot(editor.store, fileData.tldraw);
        
        // 获取所有形状ID
        const allShapeIds = Array.from(editor.getCurrentPageShapeIds().values());
        
        // 生成SVG内容 - 使用默认选项
        const svgObj = await editor.getSvgString(allShapeIds);
        
        if (svgObj && svgObj.svg) {
            // 修复SVG内容：将href替换为xlink:href以符合SVG 1.1规范
            let fixedSvgContent = svgObj.svg.replace(/<image([^>]*)href=/g, '<image$1xlink:href=');
            
            // 确保SVG包含必要的命名空间声明
            // 首先检查是否已经包含正确的xlink命名空间
            const hasCorrectXlinkNs = fixedSvgContent.includes('xmlns:xlink="http://www.w3.org/1999/xlink"');
            const hasEmptyXlinkNs = fixedSvgContent.includes('xmlns:xlink=""');
            
            if (!hasCorrectXlinkNs) {
                // 如果存在空的xlink命名空间，先移除
                if (hasEmptyXlinkNs) {
                    fixedSvgContent = fixedSvgContent.replace('xmlns:xlink=""', '');
                }
                
                // 添加正确的xlink命名空间声明
                // 确保在svg标签中添加命名空间，同时保留其他属性
                if (fixedSvgContent.includes('<svg ')) {
                    fixedSvgContent = fixedSvgContent.replace('<svg ', '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ');
                } else if (fixedSvgContent.includes('<svg>')) {
                    fixedSvgContent = fixedSvgContent.replace('<svg>', '<svg xmlns:xlink="http://www.w3.org/1999/xlink">');
                } else {
                    // 如果找不到标准的svg标签，在文件开头添加命名空间声明
                    fixedSvgContent = fixedSvgContent.replace('<?xml version="1.0"', '<?xml version="1.0"');
                }
            }
            
            // 创建svg/xml文档并添加metadata信息
            const parser = new DOMParser();
            const doc = parser.parseFromString(fixedSvgContent, 'image/svg+xml');
            const svgElement = doc.documentElement;
            
            // 准备tldraw JSON数据
            const tldrawJson = fileData.tldraw;
            
            // 创建metadata元素
            const metadataElement = doc.createElement('metadata');
            
            // <ink> meta with attributes
            const inkMetaElement = doc.createElement('ink');
            inkMetaElement.setAttribute('plugin-version', String(fileData.meta.pluginVersion));
            inkMetaElement.setAttribute('file-type', fileData.meta.fileType);
            metadataElement.appendChild(inkMetaElement);
            
            // <tldraw version="..."> JSON </tldraw>
            const settingsElement = doc.createElement('tldraw');
            settingsElement.setAttribute('version', String(TLDRAW_VERSION));
            settingsElement.textContent = JSON.stringify(tldrawJson, null, 2);
            metadataElement.appendChild(settingsElement);
            
            svgElement.appendChild(metadataElement);
            
            // 构建完整的SVG文件内容
            const svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
${svgElement.toString()}`;
            
            // 销毁编辑器实例
            editor.dispose();
            
            return svgContent;
        }
    } catch (error) {
        console.error('Error generating drawing SVG content:', error);
        
        // 如果生成失败，使用更简单的回退方案
        // 直接构建基础SVG内容，不依赖tldraw的复杂SVG生成
        return buildFileStr(fileData);
    }
    
    // 如果生成失败，回退到默认的SVG内容
    return buildFileStr(fileData);
}

export async function buildFileStrWithWritingContent(fileData: InkFileData): Promise<string> {
    try {
        // 创建临时编辑器实例 - 使用正确的构造函数参数
        // 使用defaultShapeUtils而不是coreShapes来避免重复注册核心形状
        const store = createTLStore();
        const editor = new Editor({
            store,
            shapeUtils: defaultShapeUtils, // 使用defaultShapeUtils而不是空数组
            bindingUtils: [],
            tools: [...defaultTools, ...defaultShapeTools],
            getContainer: () => document.createElement('div')
        });
        
        // 加载快照 - 使用正确的loadSnapshot调用方式
        await loadSnapshot(editor.store, fileData.tldraw);
        
        // 获取所有形状ID
        const allShapeIds = Array.from(editor.getCurrentPageShapeIds().values());
        
        // 生成SVG内容 - 使用默认选项
        const svgObj = await editor.getSvgString(allShapeIds);
        
        if (svgObj && svgObj.svg) {
            // 修复SVG内容：将href替换为xlink:href以符合SVG 1.1规范
            let fixedSvgContent = svgObj.svg.replace(/<image([^>]*)href=/g, '<image$1xlink:href=');
            
            // 确保SVG包含必要的命名空间声明
            // 添加xmlns:xlink命名空间，如果不存在正确的命名空间值
            if (!fixedSvgContent.includes('xmlns:xlink="http://www.w3.org/1999/xlink"')) {
                // 先移除可能存在的空命名空间声明
                fixedSvgContent = fixedSvgContent.replace('xmlns:xlink=""', '');
                // 添加正确的命名空间声明
                fixedSvgContent = fixedSvgContent.replace('<svg ', '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ');
            }
            
            // 创建svg/xml文档并添加metadata信息
            const parser = new DOMParser();
            const doc = parser.parseFromString(fixedSvgContent, 'image/svg+xml');
            const svgElement = doc.documentElement;
            
            // 准备tldraw JSON数据
            const tldrawJson = fileData.tldraw;
            
            // 创建metadata元素
            const metadataElement = doc.createElement('metadata');
            
            // <ink> meta with attributes
            const inkMetaElement = doc.createElement('ink');
            inkMetaElement.setAttribute('plugin-version', String(fileData.meta.pluginVersion));
            inkMetaElement.setAttribute('file-type', fileData.meta.fileType);
            metadataElement.appendChild(inkMetaElement);
            
            // <tldraw version="..."> JSON </tldraw>
            const settingsElement = doc.createElement('tldraw');
            settingsElement.setAttribute('version', String(TLDRAW_VERSION));
            settingsElement.textContent = JSON.stringify(tldrawJson, null, 2);
            metadataElement.appendChild(settingsElement);
            
            svgElement.appendChild(metadataElement);
            
            // 构建完整的SVG文件内容
            const svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
${svgElement.toString()}`;
            
            // 销毁编辑器实例
            editor.dispose();
            
            return svgContent;
        }
    } catch (error) {
        console.error('Error generating writing SVG content:', error);
    }
    
    // 如果生成失败，回退到默认的SVG内容
    return buildFileStr(fileData);
}