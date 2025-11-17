import { DOMParser } from 'xmldom';
import { TLEditorSnapshot, TLPageId, SerializedStore, TLRecord } from 'tldraw';
import { InkFileData } from '../../components/formats/current/types/file-data';
import { prepareDrawingSnapshot } from '../../components/formats/current/utils/tldraw-helpers';
import { DEFAULT_TLEDITOR_DRAWING_SNAPSHOT } from '../../defaults/default-tleditor-drawing-snapshot';
import { parseSvgToShapes } from '../../components/formats/current/utils/importSvgToTldraw';
import { reverseSvgPathToSegments } from '../../components/formats/current/utils/reverseSvgPathToSegments';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';

// --- START: Style Utility Functions (基于 importSvgToTldraw.ts) ---

/**
 * tldraw 颜色名称到 SVG Hex 值的映射
 */
const TL_COLOR_TO_HEX_MAP: Record<string, string> = {
  'black': '#1d1d1d',
  'grey': '#808080',
  'light-violet': '#c084fc',
  'violet': '#a855f7',
  'blue': '#3b82f6',
  'light-blue': '#60a5fa',
  'yellow': '#fbbf24',
  'orange': '#f97316',
  'green': '#10b981',
  'light-green': '#34d399',
  'light-red': '#f87171',
  'red': '#ef4444',
  'white': '#ffffff'
};

/**
 * 将十六进制颜色转换为tldraw颜色名称
 */
function getTldrawColorFromSvg(svgColor: string | null): string {
  if (!svgColor || svgColor === 'none' || svgColor === 'transparent') {
    return 'black';
  }

  const colorMap: Record<string, string> = {
    '#000000': 'black', '#1d1d1d': 'black', '#f2f2f2': 'black',
    '#808080': 'grey', '#9fa8b2': 'grey', '#9398b0': 'grey',
    '#c084fc': 'light-violet', '#e085f4': 'light-violet', '#e599f7': 'light-violet',
    '#a855f7': 'violet', '#ae3ec9': 'violet',
    '#3b82f6': 'blue', '#4465e9': 'blue', '#4f72fc': 'blue',
    '#60a5fa': 'light-blue', '#4ba1f1': 'light-blue', '#4dabf7': 'light-blue',
    '#fbbf24': 'yellow', '#f1ac4b': 'yellow',
    '#f97316': 'orange', '#e16919': 'orange', '#f76707': 'orange',
    '#10b981': 'green', '#099268': 'green',
    '#4cb05e': 'light-green', '#34d399': 'light-green', '#40c057': 'light-green',
    '#f87171': 'light-red', '#f87777': 'light-red', '#ff8787': 'light-red',
    '#ef4444': 'red', '#e03131': 'red',
    '#ffffff': 'white'
  };

  const normalizedColor = svgColor.toLowerCase().trim();
  
  if (Object.keys(colorMap).includes(normalizedColor)) {
    return normalizedColor;
  }

  let hexColor = normalizedColor;
  if (!hexColor.startsWith('#')) {
    const rgbMatch = normalizedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]);
      const g = parseInt(rgbMatch[2]);
      const b = parseInt(rgbMatch[3]);
      hexColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
  }

  hexColor = hexColor.replace(/[^0-9a-f#]/g, '');

  if (colorMap[hexColor]) {
    return colorMap[hexColor];
  }

  return 'black';
}

/**
 * 将 SVG 属性转换为 tldraw 样式属性
 */
function getTldrawStyleAndOpacity(element: Element, inheritedOpacity: number = 1): { styles: { color: string, fill: string, size: string, dash: string }, opacity: number } {
  const fill = element.getAttribute('fill') || 'none';
  const stroke = element.getAttribute('stroke') || 'black';
  const strokeWidth = element.getAttribute('stroke-width') || '1';
  
  let opacity = inheritedOpacity;
  const elementOpacity = element.getAttribute('opacity');
  if (elementOpacity !== null) {
    const elementOpacityValue = parseFloat(elementOpacity);
    if (!isNaN(elementOpacityValue)) {
      opacity = inheritedOpacity * elementOpacityValue;
    }
  }

  if (isNaN(opacity)) {
    opacity = 1;
  } else {
    opacity = Math.max(0, Math.min(1, opacity));
  }

  const hasFill = fill !== 'none' && fill !== 'transparent';
  const hasStroke = stroke !== 'none' && strokeWidth !== '0';

  let color = 'black';
  let fillStyle = 'none';
  let size = 'm';
  let dash = 'draw';

  if (hasFill) {
    color = getTldrawColorFromSvg(fill);
    fillStyle = 'solid';
  }

  if (hasStroke) {
    color = getTldrawColorFromSvg(stroke);
  }

  if (hasFill && hasStroke) {
    color = getTldrawColorFromSvg(fill);
    fillStyle = 'solid';
  }

  const strokeWidthNum = parseFloat(strokeWidth);
  if (strokeWidthNum <= 1) size = 's';
  else if (strokeWidthNum <= 3) size = 'm';
  else if (strokeWidthNum <= 5) size = 'l';
  else size = 'xl';

  const dashArray = element.getAttribute('stroke-dasharray');
  if (dashArray) {
    if (dashArray === '5,5') dash = 'dashed';
    else if (dashArray === '10,5') dash = 'dotted';
  }

  return {
    styles: { color, fill: fillStyle, size, dash },
    opacity: opacity
  };
}

/**
 * 解析SVG变换字符串，提取x和y坐标
 */
function parseTransform(transformString: string): { x: number, y: number } {
  const matrixMatch = transformString.match(/matrix\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*\)/);
  
  if (matrixMatch) {
    return {
      x: parseFloat(matrixMatch[5]) || 0,
      y: parseFloat(matrixMatch[6]) || 0
    };
  }

  const translateMatch = transformString.match(/translate\(\s*([^,]+)\s*,\s*([^,]+)\s*\)/);
  
  if (translateMatch) {
    return {
      x: parseFloat(translateMatch[1]) || 0,
      y: parseFloat(translateMatch[2]) || 0
    };
  }

  return { x: 0, y: 0 };
}

/**
 * 根据SVG元素特征判断tldraw形状类型
 */
function getShapeTypeFromSvgElement(element: Element): 'draw' | 'geo' {
  const tagName = element.tagName.toLowerCase();
  
  if (tagName === 'path') {
    const d = element.getAttribute('d') || '';
    if (d.includes('C') && d.includes('M')) {
      return 'geo'; // 包含贝塞尔曲线，可能是复杂图形
    }
    return 'draw'; // 简单路径
  }
  
  if (tagName === 'rect' || tagName === 'circle' || tagName === 'ellipse') {
    return 'geo'; // 基本几何形状
  }
  
  return 'draw'; // 默认类型
}

// --- END: Style Utility Functions ---

/**
 * 检测SVG是否为常规SVG（不含Ink元数据）
 */
export function isRegularSvg(svgString: string): boolean {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    
    const parseError = doc.getElementsByTagName('parsererror');
    if (parseError.length > 0) {
      return false;
    }
    
    const metadataElements = doc.getElementsByTagName('metadata');
    if (metadataElements.length === 0) {
      return true;
    }
    
    const metadataElement = metadataElements[0];
    const inkElements = metadataElement.getElementsByTagName('ink');
    if (inkElements.length === 0) {
      return true;
    }
    
    const inkElement = inkElements[0];
    const fileType = inkElement.getAttribute('file-type');
    if (!fileType || (fileType !== 'inkDrawing' && fileType !== 'inkWriting')) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error detecting regular SVG:', error);
    return false;
  }
}

/**
 * 将常规SVG转换为Ink格式
 */
export function convertRegularSvgToInk(svgString: string, fileType: 'inkDrawing' | 'inkWriting' = 'inkDrawing'): InkFileData {
  try {
    // 直接调用parseSvgToShapes函数进行SVG解析
    const { shapes, imageData } = parseSvgToShapes(svgString);
    
    // 使用默认的快照结构作为基础
    const baseSnapshot: TLEditorSnapshot = JSON.parse(JSON.stringify(DEFAULT_TLEDITOR_DRAWING_SNAPSHOT));
    
    // 使用与importSvgToTldraw.ts一致的页面ID
    const correctPageId = 'page:page1';
    
    // 确保store中的页面ID与session中的页面ID一致
    const store = baseSnapshot.document.store as any;
    
    // 更新session中的页面ID
    baseSnapshot.session.currentPageId = correctPageId as TLPageId;
    if (baseSnapshot.session.pageStates && baseSnapshot.session.pageStates.length > 0) {
      baseSnapshot.session.pageStates[0].pageId = correctPageId as TLPageId;
    }
    
    // 将解析的形状数据转换为tldraw快照格式
    let shapeIndex = 1;
    
    shapes.forEach((shapeData: any) => {
      const shapeId = `shape:${shapeData.type}-${shapeIndex++}`;
      
      // ✅ 注意：parseSvgToShapes函数已经应用了viewBox偏移校正
      // 这里直接使用shapeData中的位置数据，避免重复校正
      console.log(`创建形状 ${shapeId}: 类型=${shapeData.type}, 位置=(${shapeData.x}, ${shapeData.y})`);
      
      // 根据形状类型创建对应的tldraw形状，复用importSvgToTldraw.ts中的逻辑
      const shape: any = {
        id: shapeId,
        typeName: 'shape',
        type: shapeData.type,
        x: shapeData.x || 0, // parseSvgToShapes已经应用了viewBox偏移校正
        y: shapeData.y || 0, // parseSvgToShapes已经应用了viewBox偏移校正
        rotation: shapeData.rotation || 0,
        isLocked: false,
        opacity: shapeData.opacity !== undefined && shapeData.opacity !== null ? shapeData.opacity : 1,
        meta: {},
        parentId: correctPageId,
        index: `a${shapeIndex}`,
        props: {}
      };
      
      // 根据形状类型设置特定属性，复用importSvgToTldraw.ts中的逻辑
      switch (shapeData.type) {
        case 'draw':
          shape.props = {
            segments: shapeData.segments || [],
            isComplete: shapeData.isComplete !== undefined ? shapeData.isComplete : true,
            isPen: shapeData.isPen !== undefined ? shapeData.isPen : false,
            isClosed: shapeData.isClosed !== undefined ? shapeData.isClosed : false,
            color: shapeData.color || 'black',
            fill: shapeData.fill || 'none',
            size: shapeData.size || 'm',
            dash: shapeData.dash || 'draw',
            scale: shapeData.scale || 1
          };
          break;
          
        case 'geo':
          shape.props = {
            geo: shapeData.geo || 'rectangle',
            w: shapeData.w || 100,
            h: shapeData.h || 100,
            color: shapeData.color || 'black',
            fill: shapeData.fill || 'none',
            size: shapeData.size || 'm',
            dash: shapeData.dash || 'draw',
            scale: shapeData.scale || 1,
            labelColor: 'black',
            font: 'draw',
            align: 'middle',
            verticalAlign: 'middle'
          };
          break;
          
        case 'image':
          shape.props = {
            w: shapeData.w || 100,
            h: shapeData.h || 100,
            assetId: shapeData.assetId || 'placeholder-asset-id'
          };
          break;
          
        case 'text':
          shape.props = {
            text: shapeData.text || '',
            font: shapeData.font || 'draw',
            align: shapeData.align || 'middle',
            verticalAlign: shapeData.verticalAlign || 'middle',
            w: shapeData.w || 200,
            h: shapeData.h || 100,
            color: shapeData.color || 'black',
            size: shapeData.size || 'm'
          };
          break;
          
        case 'path':
          // 对于path类型，转换为draw类型，复用importSvgToTldraw.ts中的逻辑
          shape.type = 'draw';
          
          // 使用reverseSvgPathToSegments解析路径数据
          let segments: any[] = [];
          if (shapeData.d) {
            try {
              segments = reverseSvgPathToSegments(shapeData.d, { bezierSegments: 32, arcSegments: 48 });
            } catch (error) {
              console.warn('路径解析失败，使用默认segments:', error);
              segments = [];
            }
          }
          
          // 判断路径是否闭合
          let isClosed = false;
          if (segments.length > 0 && segments[0].points.length > 1) {
            const firstPoint = segments[0].points[0];
            const lastPoint = segments[0].points[segments[0].points.length - 1];
            isClosed = Math.abs(firstPoint.x - lastPoint.x) < 0.001 && 
                      Math.abs(firstPoint.y - lastPoint.y) < 0.001;
          }
          
          shape.props = {
            segments: segments,
            isComplete: true,
            isPen: false,
            isClosed: isClosed,
            color: shapeData.color || 'black',
            fill: isClosed ? (shapeData.fill || 'none') : 'none',
            size: shapeData.size || 'm',
            dash: shapeData.dash || 'draw',
            scale: shapeData.scale || 1
          };
          break;
          
        default:
          // 对于不支持的类型，创建默认的geo形状
          console.warn(`不支持的类型: ${shapeData.type}，转换为默认geo形状`);
          shape.type = 'geo';
          shape.props = {
            geo: 'rectangle',
            w: 100,
            h: 100,
            color: 'black',
            fill: 'none',
            size: 'm',
            dash: 'draw',
            labelColor: 'black',
            font: 'draw',
            align: 'middle',
            verticalAlign: 'middle'
          };
          break;
      }
      
      // 将形状添加到store中
      store[shapeId] = shape;
    });
    
    // 如果没有找到任何形状，创建一个默认的矩形
    if (shapes.length === 0) {
      const defaultShapeId = 'shape:default';
      store[defaultShapeId] = {
        id: defaultShapeId,
        typeName: 'shape',
        type: 'geo',
        x: 100,
        y: 100,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        meta: {},
        parentId: correctPageId,
        index: 'a1',
        props: {
          geo: 'rectangle',
          w: 200,
          h: 150,
          color: 'black',
          fill: 'none',
          size: 'm',
          dash: 'draw',
          labelColor: 'black',
          font: 'draw',
          align: 'middle',
          verticalAlign: 'middle'
        }
      };
    }
    
    // Ensure the schema structure is complete
    if (!baseSnapshot.document.schema) {
        baseSnapshot.document.schema = {
            schemaVersion: 2,
            sequences: {
                "com.tldraw.store": 4,
                "com.tldraw.asset": 1,
                "com.tldraw.camera": 1,
                "com.tldraw.document": 2,
                "com.tldraw.instance": 25,
                "com.tldraw.instance_page_state": 5,
                "com.tldraw.page": 1,
                "com.tldraw.instance_presence": 5,
                "com.tldraw.pointer": 1,
                "com.tldraw.shape": 4,
                "com.tldraw.asset.bookmark": 2,
                "com.tldraw.asset.image": 5,
                "com.tldraw.asset.video": 5,
                "com.tldraw.shape.group": 0,
                "com.tldraw.shape.text": 2,
                "com.tldraw.shape.bookmark": 2,
                "com.tldraw.shape.draw": 2,
                "com.tldraw.shape.geo": 9,
                "com.tldraw.shape.note": 7,
                "com.tldraw.shape.line": 5,
                "com.tldraw.shape.frame": 0,
                "com.tldraw.shape.arrow": 5,
                "com.tldraw.shape.highlight": 1,
                "com.tldraw.shape.embed": 4,
                "com.tldraw.shape.image": 4,
                "com.tldraw.shape.video": 2
            }
        };
    }
    
    // Ensure the basic document and page records exist
    if (!store["document:document"]) {
        store["document:document"] = {
            "gridSize": 10,
            "name": "",
            "meta": {},
            "id": "document:document",
            "typeName": "document"
        };
    }
    
    if (!store["page:page1"]) {
        store["page:page1"] = {
            "meta": {},
            "id": "page:page1",
            "name": "Handwritten Note",
            "index": "a1",
            "typeName": "page"
        };
    }
    
    // Ensure session points to the correct page
    if (!baseSnapshot.session) {
        baseSnapshot.session = {
            "version": 0,
            "currentPageId": "page:page1" as any,
            "exportBackground": true,
            "isFocusMode": false,
            "isDebugMode": true,
            "isToolLocked": false,
            "isGridMode": true,
            "pageStates": [
                {
                    "pageId": "page:page1" as any,
                    "camera": {
                        "x": 0,
                        "y": 0,
                        "z": 0.3,
                    },
                    "selectedShapeIds": [],
                    "focusedGroupId": null
                }
            ]
        };
    } else {
        baseSnapshot.session.currentPageId = "page:page1" as any;
    }
    
    // Use prepareDrawingSnapshot to fix any remaining issues
    const preparedSnapshot = prepareDrawingSnapshot(baseSnapshot);
    
    return {
      meta: {
        fileType: fileType,
        pluginVersion: PLUGIN_VERSION,
        tldrawVersion: TLDRAW_VERSION
      },
      tldraw: preparedSnapshot,
      svgString: svgString
    };
    
  } catch (error) {
    console.error('Error converting regular SVG to Ink using importSvgToTldraw logic:', error);
    
    // 错误处理：返回默认的快照结构
    const fallbackSnapshot: TLEditorSnapshot = JSON.parse(JSON.stringify(DEFAULT_TLEDITOR_DRAWING_SNAPSHOT));
    
    const preparedFallback = prepareDrawingSnapshot(fallbackSnapshot);
    
    return {
      meta: {
        fileType: fileType,
        pluginVersion: PLUGIN_VERSION,
        tldrawVersion: TLDRAW_VERSION
      },
      tldraw: preparedFallback,
      svgString: svgString
    };
  }
}

/**
 * 智能处理SVG文件：自动识别格式并返回Ink数据
 */
export function autoConvertRegularSvgToInk(svgString: string): InkFileData {
  try {
    // 如果是Ink格式SVG，直接提取数据
    if (!isRegularSvg(svgString)) {
      const inkData = extractInkJsonFromSvg(svgString);
      if (inkData) {
        return inkData;
      }
    }
    
    // 如果是常规SVG，进行转换
    return convertRegularSvgToInk(svgString);
  } catch (error) {
    console.error('Error in autoConvertRegularSvgToInk:', error);
    
    // 返回安全的默认快照结构
    const fallbackSnapshot: TLEditorSnapshot = JSON.parse(JSON.stringify(DEFAULT_TLEDITOR_DRAWING_SNAPSHOT));
    
    // 确保schema结构完整
    if (!fallbackSnapshot.document.schema) {
      fallbackSnapshot.document.schema = {
        schemaVersion: 2,
        sequences: {
          'com.tldraw.store': 4,
          'com.tldraw.asset': 1,
          'com.tldraw.camera': 1,
          'com.tldraw.document': 2,
          'com.tldraw.instance': 25,
          'com.tldraw.instance_page_state': 5,
          'com.tldraw.page': 1,
          'com.tldraw.instance_presence': 5,
          'com.tldraw.pointer': 1,
          'com.tldraw.shape': 4,
          'com.tldraw.asset.bookmark': 2,
          'com.tldraw.asset.image': 5,
          'com.tldraw.asset.video': 5,
          'com.tldraw.shape.group': 0,
          'com.tldraw.shape.text': 2,
          'com.tldraw.shape.bookmark': 2,
          'com.tldraw.shape.draw': 2,
          'com.tldraw.shape.geo': 9,
          'com.tldraw.shape.note': 7,
          'com.tldraw.shape.line': 5,
          'com.tldraw.shape.frame': 0,
          'com.tldraw.shape.arrow': 5,
          'com.tldraw.shape.highlight': 1,
          'com.tldraw.shape.embed': 4,
          'com.tldraw.shape.image': 4,
          'com.tldraw.shape.video': 2
        }
      };
    }
    
    return {
      meta: {
        fileType: 'inkDrawing',
        pluginVersion: PLUGIN_VERSION,
        tldrawVersion: TLDRAW_VERSION
      },
      tldraw: fallbackSnapshot,
      svgString: svgString
    };
  }
}

/**
 * Extracts JSON content from a <tldraw> XML element within SVG metadata.
 * Falls back to legacy <inkdrawing> element for backward compatibility.
 * Also reads an optional <filetype> sibling and merges into meta.fileType if present.
 * @param svgString - The SVG string containing the metadata element
 * @returns The parsed JSON object or null if not found/invalid
 */
export function extractInkJsonFromSvg(svgString: string): InkFileData | null {
    try {
        // Parse the SVG string as XML
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');
        
        // Check for parsing errors
        const parseError = doc.getElementsByTagName('parsererror');
        if (parseError.length > 0) {
            console.warn('Failed to parse SVG as XML');
            return null;
        }
        
        // Find the metadata element
        const metadataElements = doc.getElementsByTagName('metadata');
        if (metadataElements.length === 0) {
            console.warn('No metadata element found in SVG');
            return null;
        }
        
        // Look for tldraw element within metadata
        const metadataElement = metadataElements[0];

        // Gate on filetype being 'inkDrawing' or 'inkWriting' before parsing tldraw
        // Prefer <ink fileType="..."> attribute; fall back to <filetype> element if present
        const inkElements = metadataElement.getElementsByTagName('ink');
        let fileTypeText: string | undefined;
        if (inkElements.length > 0) {
            fileTypeText = inkElements[0].getAttribute('file-type') || undefined;
        }
        if (!fileTypeText) {
            console.warn('No filetype found in metadata');
            return null;
        }
        if (fileTypeText !== 'inkDrawing' && fileTypeText !== 'inkWriting') {
            console.warn('Unsupported or missing filetype in metadata');
            return null;
        }

        const tldrawElements = metadataElement.getElementsByTagName('tldraw');
        
        // Ensure tldraw exists
        const hasTldraw = tldrawElements.length > 0;
        if (!hasTldraw) {
            console.warn('No tldraw element found in metadata');
            return null;
        }
        
        // Get the content of the tldraw element
        const settingsElement = tldrawElements[0];
        const jsonText = settingsElement.textContent?.trim();
        
        if (!jsonText) {
            console.warn('No JSON content found in metadata settings element');
            return null;
        }
        
        // Parse the JSON content (tldraw snapshot only)
        let tldrawSnapshot: TLEditorSnapshot;
        try {
            tldrawSnapshot = JSON.parse(jsonText) as TLEditorSnapshot;
        } catch (error) {
            console.warn('解析tldraw快照JSON失败:', error);
            return null;
        }

        // Also read pluginVersion from <ink>
        const pluginVersionAttr = inkElements.length > 0 ? (inkElements[0].getAttribute('plugin-version') || undefined) : undefined;

        // Read tldraw version from <tldraw version="...">
        const tldrawVersionAttr = settingsElement.getAttribute('version') || undefined;

        // Construct InkFileData result
        const inkFileData: InkFileData = {
            meta: {
                pluginVersion: pluginVersionAttr || '',
                tldrawVersion: tldrawVersionAttr || '',
                fileType: fileTypeText,
            },
            tldraw: tldrawSnapshot,
            svgString: svgString,  // 添加必需的svgString字段
        } as InkFileData;

        return inkFileData;
        
    } catch (error) {
        console.error('Error extracting tldraw metadata JSON:', error);
        return null;
    }
}