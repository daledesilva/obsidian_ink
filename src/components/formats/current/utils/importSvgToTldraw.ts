import { Editor, TLShape, createShapeId } from 'tldraw';
import { DOMParser } from 'xmldom';
import { reverseSvgPathToSegments, TLDrawSegment, TLDrawPoint } from './reverseSvgPathToSegments';

// 尝试导入DefaultColorThemePalette
import { DefaultColorThemePalette } from '@tldraw/tlschema';

// 导入sampleQuadratic函数用于处理二次贝塞尔曲线
// 注意：由于sampleQuadratic不是导出函数，我们需要在这里重新定义它
function sampleQuadratic(
  p0: TLDrawPoint,
  p1: TLDrawPoint,
  p2: TLDrawPoint,
  segments: number
): TLDrawPoint[] {
  const pts: TLDrawPoint[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const u = 1 - t
    const x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x
    const y = u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
    pts.push({ x, y, z: 0.5 })
  }
  return pts
}
// --- START: Style Utility Functions (Reverse Mapping from SVG to Tldraw) ---

/**
 * 从DefaultColorThemePalette生成颜色映射表
 * @returns 颜色映射表
 */
function generateColorMapFromPalette(): Record<string, string> {
  const colorMap: Record<string, string> = {};
  
  // 获取所有颜色名称
  const colorNames = Object.keys(DefaultColorThemePalette.lightMode).filter(
    key => key !== 'id' && key !== 'text' && key !== 'background' && key !== 'solid'
  );
  
  // 处理浅色模式
  for (const colorName of colorNames) {
    // 使用类型断言来避免TypeScript类型检查错误
    const colorData = (DefaultColorThemePalette.lightMode as any)[colorName];
    if (colorData && typeof colorData === 'object') {
      colorMap[colorData.solid] = colorName;
      colorMap[colorData.fill] = colorName;
      colorMap[colorData.semi] = colorName;
      colorMap[colorData.pattern] = colorName;
      colorMap[colorData.noteFill] = colorName;
      colorMap[colorData.frameHeadingStroke] = colorName;
      colorMap[colorData.frameHeadingFill] = colorName;
      colorMap[colorData.frameStroke] = colorName;
      colorMap[colorData.frameFill] = colorName;
      colorMap[colorData.frameText] = colorName;
      colorMap[colorData.noteText] = colorName;
      colorMap[colorData.highlightSrgb] = colorName;
    }
  }
  
  // 处理暗黑模式
  for (const colorName of colorNames) {
    // 使用类型断言来避免TypeScript类型检查错误
    const colorData = (DefaultColorThemePalette.darkMode as any)[colorName];
    if (colorData && typeof colorData === 'object') {
      colorMap[colorData.solid] = colorName;
      colorMap[colorData.fill] = colorName;
      colorMap[colorData.semi] = colorName;
      colorMap[colorData.pattern] = colorName;
      colorMap[colorData.noteFill] = colorName;
      colorMap[colorData.frameHeadingStroke] = colorName;
      colorMap[colorData.frameHeadingFill] = colorName;
      colorMap[colorData.frameStroke] = colorName;
      colorMap[colorData.frameFill] = colorName;
      colorMap[colorData.frameText] = colorName;
      colorMap[colorData.noteText] = colorName;
      colorMap[colorData.highlightSrgb] = colorName;
    }
  }
  
  // 添加一些常见颜色的映射
  colorMap['#000000'] = 'black';
  colorMap['#ffffff'] = 'white';
  colorMap['#808080'] = 'grey';
  colorMap['#fbbf24'] = 'yellow';
  colorMap['#f97316'] = 'orange';
  colorMap['#10b981'] = 'green';
  colorMap['#4cb05e'] = 'green'; // 添加这个绿色映射
  colorMap['#ef4444'] = 'red';
  colorMap['#3b82f6'] = 'blue';
  colorMap['#60a5fa'] = 'light-blue';
  colorMap['#34d399'] = 'light-green';
  colorMap['#f87171'] = 'light-red';
  colorMap['#c084fc'] = 'light-violet';
  colorMap['#a855f7'] = 'violet';
  
  return colorMap;
}

/**
 * 将十六进制颜色转换为tldraw颜色名称
 * @param svgColor SVG颜色值（十六进制、RGB、颜色名称等）
 * @returns tldraw颜色名称
 */
/**
 * 将SVG颜色转换为tldraw draw形状的fill属性
 * @param svgColor SVG颜色值
 * @returns tldraw draw形状的fill属性值（'none', 'semi', 'solid', 'pattern', 'fill'）
 */
function getTldrawFillStyleFromSvg(svgColor: string | null): string {
  if (!svgColor || svgColor === 'none' || svgColor === 'transparent') {
    return 'none'; // 无填充
  }

  // 对于任何非none的颜色，返回'semi'作为默认填充样式
  // 这样可以保持与getTldrawStyleAndOpacity函数中fillStyle的处理一致
  return 'semi';
}

/**
 * 将SVG颜色转换为tldraw支持的颜色名称
 * @param svgColor SVG颜色值
 * @returns tldraw支持的颜色名称
 */
function getTldrawColorFromSvg(svgColor: string | null, colorMap?: Record<string, string>): string {
  if (!svgColor || svgColor === 'none' || svgColor === 'transparent') {
    return 'black'; // 默认颜色
  }

  // tldraw支持的颜色名称列表（来自@tldraw/tlschema）
  const tldrawColors = [
    'black', 'grey', 'light-violet', 'violet', 'blue', 'light-blue', 
    'yellow', 'orange', 'green', 'light-green', 'light-red', 'red', 'white'
  ];
  
  // 使用传入的colorMap或生成新的颜色映射表
  const mapToUse = colorMap || generateColorMapFromPalette();

  // 规范化颜色值
  const normalizedColor = svgColor.toLowerCase().trim();
  
  // 1. 如果颜色已经是tldraw支持的颜色名称，直接返回
  if (tldrawColors.includes(normalizedColor)) {
    return normalizedColor;
  }
  
  // 2. 尝试匹配Hex值
  let hexColor = normalizedColor;
  if (!hexColor.startsWith('#')) {
    // 如果是rgb/rgba格式，转换为hex
    const rgbMatch = normalizedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]);
      const g = parseInt(rgbMatch[2]);
      const b = parseInt(rgbMatch[3]);
      hexColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
  }
  
  // 清理hex颜色值
  hexColor = hexColor.replace(/[^0-9a-f#]/g, '');
  
  // 3. 如果颜色在映射表中，直接返回
  if (mapToUse[hexColor]) {
    return mapToUse[hexColor];
  }
  
  // 4. 对于不在映射表中的颜色，尝试近似匹配
  const matchedColor = findClosestColor(hexColor, mapToUse);
  if (matchedColor) {
    console.log(`颜色 ${svgColor} 近似匹配到 ${matchedColor}`);
    return matchedColor;
  }
  
  // 5. 对于无法匹配的颜色，显示警告并返回默认值
  console.warn(`警告：颜色 ${svgColor} 不在tldraw支持的颜色列表中，映射为black`);
  return 'black';
}

/**
 * 将hex颜色转换为RGB对象
 */
function hexToRgb(hex: string): {r: number, g: number, b: number} | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * 查找最接近的颜色匹配
 * @param hexColor 十六进制颜色值
 * @param colorMap 颜色映射表
 * @returns 最接近的颜色名称或null
 */
function findClosestColor(hexColor: string, colorMap: Record<string, string>): string | null {
  if (!hexColor.startsWith('#')) {
    return null;
  }
  
  try {
    const inputRgb = hexToRgb(hexColor);
    if (!inputRgb) {
      return null;
    }
    
    let bestMatch: string | null = null;
    let minDistance = Infinity;
    
    for (const [hex, colorName] of Object.entries(colorMap)) {
      if (hex.startsWith('#')) {
        const targetRgb = hexToRgb(hex);
        if (targetRgb) {
          const distance = colorDistance(inputRgb, targetRgb);
          if (distance < minDistance) {
            minDistance = distance;
            bestMatch = colorName;
          }
        }
      }
    }
    
    return bestMatch;
  } catch (e) {
    console.warn('颜色近似匹配失败:', e);
    return null;
  }
}

/**
 * 计算两个RGB颜色之间的欧几里得距离
 */
function colorDistance(rgb1: {r: number, g: number, b: number}, rgb2: {r: number, g: number, b: number}): number {
  const rDiff = rgb1.r - rgb2.r;
  const gDiff = rgb1.g - rgb2.g;
  const bDiff = rgb1.b - rgb2.b;
  return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
}

/**
 * 将 SVG 属性转换为 tldraw 样式属性
 * @param element SVG DOM 元素
 * @param transform 变换字符串（用于提取opacity信息）
 * @returns 包含 tldraw 样式属性的对象
 */
function parseStyleString(style: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!style) return out
  style.split(';').forEach(pair => {
    const [k, v] = pair.split(':').map(s => s && s.trim())
    if (k && v) out[k] = v
  })
  return out
}

/**
 * 解析颜色字符串 -> { color: string (hex or rgb string without alpha), alpha: number (0..1) }
 * 支持: #rgb, #rrggbb, rgb(r,g,b), rgba(r,g,b,a)
 * 对于无法解析或命名色，返回原色字符串并 alpha=1
 */
function parseColorAndAlpha(raw: string | null): { color: string | null; alpha: number } {
  if (!raw) return { color: null, alpha: 1 }
  const s = raw.trim()
  // hex #rrggbb or #rgb
  const hexMatch = s.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (hexMatch) {
    const hex = hexMatch[1]
    if (hex.length === 3) {
      const r = hex[0] + hex[0]
      const g = hex[1] + hex[1]
      const b = hex[2] + hex[2]
      return { color: `#${r}${g}${b}`, alpha: 1 }
    } else {
      return { color: `#${hex}`, alpha: 1 }
    }
  }
  // rgb(...) or rgba(...)
  const rgbMatch = s.match(/^rgba?\(\s*([^\)]+)\s*\)$/)
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map(p => p.trim())
    if (parts.length >= 3) {
      const r = parseInt(parts[0], 10)
      const g = parseInt(parts[1], 10)
      const b = parseInt(parts[2], 10)
      const a = parts.length === 4 ? parseFloat(parts[3]) : 1
      if (![r, g, b].some(v => Number.isNaN(v))) {
        // 返回 rgb(...) 作为 color（不含 alpha），并把 alpha 单独返回
        return { color: `rgb(${r}, ${g}, ${b})`, alpha: Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 1 }
      }
    }
  }
  // 其他情况（例如命名颜色 'red' 或 'currentColor'）——返回原样，alpha=1
  return { color: s, alpha: 1 }
}

/**
 * 映射 SVG 色彩到 tldraw 色值（简单包装）
 * - 如果 color 包含 alpha（rgba），会被 parseColorAndAlpha 拆分；本函数只返回 "主色字符串"（无 alpha）
 * - 可在此处扩展为把 web 色名映射为 tldraw 支持的 palette key
 */
function getTldrawColorFromSvgRaw(raw: string | null): { color: string | null; alpha: number } {
  return parseColorAndAlpha(raw)
}

/**
 * 主函数：读取元素的 fill/stroke/style/opacity 等，并返回 tldraw 样式与合成的不透明度
 */
function getTldrawStyleAndOpacity(
  element: Element,
  transform?: string,
  inheritedOpacity: number = 1
): { styles: { color: string; fill: string; size: string; dash: string }, opacity: number } {
  // 解析内联 style（优先）
  const styleAttr = element.getAttribute('style')
  const styleMap = parseStyleString(styleAttr)

  // 从 styleMap 或 属性直接读取
  const rawFill = styleMap['fill'] ?? element.getAttribute('fill') ?? null
  const rawStroke = styleMap['stroke'] ?? element.getAttribute('stroke') ?? null

  // 解析各类 opacity 属性：element opacity, fill-opacity, stroke-opacity
  const elemOpacityRaw = styleMap['opacity'] ?? element.getAttribute('opacity') ?? null
  const fillOpacityRaw = styleMap['fill-opacity'] ?? element.getAttribute('fill-opacity') ?? null
  const strokeOpacityRaw = styleMap['stroke-opacity'] ?? element.getAttribute('stroke-opacity') ?? null

  // stroke-width and dash
  const strokeWidthRaw = styleMap['stroke-width'] ?? element.getAttribute('stroke-width') ?? '1'
  const strokeDasharray = styleMap['stroke-dasharray'] ?? element.getAttribute('stroke-dasharray') ?? 'none'
  const strokeLinecap = styleMap['stroke-linecap'] ?? element.getAttribute('stroke-linecap') ?? element.getAttribute('stroke-linecap') ?? 'round'

  // 解析数值
  const inherited = Number.isFinite(inheritedOpacity) ? Number(inheritedOpacity) : 1
  const elemOpacity = elemOpacityRaw !== null ? parseFloat(elemOpacityRaw) : 1
  const fillOpacity = fillOpacityRaw !== null ? parseFloat(fillOpacityRaw) : 1
  const strokeOpacity = strokeOpacityRaw !== null ? parseFloat(strokeOpacityRaw) : 1

  // 解析颜色和内含 alpha
  const fillParsed = getTldrawColorFromSvgRaw(rawFill)
  const strokeParsed = getTldrawColorFromSvgRaw(rawStroke)

  // 判定是否有 fill / stroke
  const hasFill = rawFill !== null && rawFill !== 'none' && rawFill !== 'transparent'
  const hasStroke = rawStroke !== null && rawStroke !== 'none' && parseFloat(strokeWidthRaw) !== 0

  // 决定主色（tldraw 仅接收一个 color + opacity）
  // 规则：如果元素有填充（非 none），把填充视为主色；否则如果只有描边，则描边为主色
  // 修复：直接使用SVG中的颜色，而不是近似匹配
  let primaryColor = 'black'
  let colorAlphaFromColor = 1
  if (hasFill) {
    if (fillParsed.color) {
      // 直接使用SVG中的颜色，而不是近似匹配
      primaryColor = fillParsed.color
      colorAlphaFromColor = fillParsed.alpha
    } else if (hasStroke && strokeParsed.color) {
      // 直接使用SVG中的颜色，而不是近似匹配
      primaryColor = strokeParsed.color
      colorAlphaFromColor = strokeParsed.alpha
    }
  } else if (hasStroke) {
    if (strokeParsed.color) {
      // 直接使用SVG中的颜色，而不是近似匹配
      primaryColor = strokeParsed.color
      colorAlphaFromColor = strokeParsed.alpha
    }
  } else {
    // 没有 fill 也没有 stroke -> 使用黑色（或你想要的默认）
    primaryColor = 'black'
    colorAlphaFromColor = 1
  }

  // 合成最终不透明度： inherited * elemOpacity * (fill/stroke specific opacity) * colorAlpha
  // 若同时有 fill 和 stroke，我们优先取主色对应的 opacity（fill 优先）
  const primaryElementSpecificOpacity = hasFill ? (isFinite(fillOpacity) ? fillOpacity : 1) : (isFinite(strokeOpacity) ? strokeOpacity : 1)
  let finalOpacity = inherited * (isFinite(elemOpacity) ? elemOpacity : 1) * primaryElementSpecificOpacity * (isFinite(colorAlphaFromColor) ? colorAlphaFromColor : 1)
  if (!isFinite(finalOpacity) || Number.isNaN(finalOpacity)) finalOpacity = 1
  finalOpacity = Math.max(0, Math.min(1, finalOpacity))

  // dash mapping（保持你原来的简化映射）
  let dash = 'draw'
  if (strokeDasharray && strokeDasharray !== 'none') {
    // 支持常用几种 pattern 的映射
    if (strokeDasharray.indexOf(' ') >= 0 || strokeDasharray.indexOf(',') >= 0) {
      const items = strokeDasharray.split(/[\s,]+/).map(s => parseFloat(s))
      if (items.length >= 2) {
        // 简单启发式：长短近似 -> dashed；非常小间隔-> dotted
        const avg = (items[0] + items[1]) / 2
        dash = avg <= 3 ? 'dotted' : 'dashed'
      } else {
        dash = 'dashed'
      }
    } else {
      dash = 'dashed'
    }
  } else {
    if (strokeLinecap === 'round') dash = 'draw'
    else dash = 'solid'
  }

  // size 映射
  const strokeWidthNum = parseFloat(strokeWidthRaw as string) || 1
  let size: string = 'm'
  if (strokeWidthNum <= 1) size = 's'
  else if (strokeWidthNum <= 3) size = 'm'
  else if (strokeWidthNum <= 5) size = 'l'
  else size = 'xl'

  // fillStyle: tldraw的填充类型，如果有填充色则为'semi'，否则为'none'
  // 修复：使用'semi'而不是'solid'，避免常规SVG手绘导入变成镂空
  const fillStyle = hasFill && fillParsed.color ? 'semi' : 'none'

  // debug log（必要时可注释）
  // console.log('getTldrawStyleAndOpacity:', { rawFill, rawStroke, fillParsed, strokeParsed, elemOpacity, fillOpacity, strokeOpacity, finalOpacity })

  return {
    styles: {
      color: primaryColor ?? '#000000',
      fill: fillStyle,
      size,
      dash,
    },
    opacity: finalOpacity,
  }
}

/**
 * SVG形状数据转换为tldraw形状的接口
 */
interface SvgShapeData {
  id: string;
  type: string;
  d?: string; // 路径数据（用于path类型）
  transform?: string; // 变换矩阵
  fill?: string; // 填充颜色 (SVG attribute)
  stroke?: string; // 描边颜色 (SVG attribute)
  strokeWidth?: number; // 描边宽度 (SVG attribute)
  opacity?: number; // 不透明度 (SVG attribute)
  x?: number; // 形状 x 坐标
  y?: number; // 形状 y 坐标
  w?: number; // 形状宽度
  h?: number; // 形状高度
  rotation?: number; // 旋转角度
  children?: SvgShapeData[]; // 子元素（用于组）
  // draw类型特有属性
  segments?: any[];
  points?: { x: number; y: number; z: number }[]; // 点集合（用于draw类型）
  isComplete?: boolean;
  isPen?: boolean;
  isClosed?: boolean; // 路径是否闭合
  // geo类型特有属性
  geo?: string;
  // image类型特有属性
  assetId?: string;
  assetInfo?: any; // asset资源信息
  // text类型特有属性
  text?: string;
  font?: string;
  align?: string;
  verticalAlign?: string;
  // arrow类型特有属性
  start?: any;
  end?: any;
  // note类型特有属性
  color?: string;
  size?: string;
  dash?: string;
  scale?: number;
  // embed/bookmark类型特有属性
  url?: string;
}
  
  /**
   * 从SVG中提取实际的图片数据
 * @param svgString SVG文件内容
 * @returns 包含所有图片数据的对象数组，键为图片标识符
 */
function extractImageDataFromSvg(svgString: string): Record<string, { base64Data: string, width: number, height: number, x: number, y: number }> {
  const imageDataMap: Record<string, { base64Data: string, width: number, height: number, x: number, y: number }> = {};
  let imageIndex = 0;
  
  // 首先尝试从<defs>标签中提取所有图片数据
  const defsStartIndex = svgString.indexOf('<defs>');
  if (defsStartIndex !== -1) {
    const defsEndIndex = svgString.indexOf('</defs>', defsStartIndex);
    if (defsEndIndex !== -1) {
      const defsElement = svgString.substring(defsStartIndex, defsEndIndex + '</defs>'.length);
      
      // 使用正则表达式查找所有image元素
      const imageRegex = /<image[^>]+>/g;
      let match;
      while ((match = imageRegex.exec(defsElement)) !== null) {
        const imageElement = match[0];
        
        // 提取base64数据
        const base64Match = imageElement.match(/xlink:href="data:image\/png;base64,([^"]+)"/);
        // 提取宽度和高度
        const widthMatch = imageElement.match(/width="([^"]+)"/);
        const heightMatch = imageElement.match(/height="([^"]+)"/);
        // 提取x和y位置
        const xMatch = imageElement.match(/x="([^"]+)"/);
        const yMatch = imageElement.match(/y="([^"]+)"/);
        
        if (base64Match && widthMatch && heightMatch) {
          const base64Data = base64Match[1];
          const width = parseFloat(widthMatch[1]);
          const height = parseFloat(heightMatch[1]);
          const x = xMatch ? parseFloat(xMatch[1]) : 0;
          const y = yMatch ? parseFloat(yMatch[1]) : 0;
          
          // 生成图片标识符
          const imageId = `image_${imageIndex++}`;
          imageDataMap[imageId] = { base64Data, width, height, x, y };
          console.log(`从SVG中提取到图片数据 ${imageId} (位置: ${x},${y})`);
        }
      }
    }
  }
  
  // 如果defs中没有找到，尝试查找所有包含image元素的g元素
  // 避免使用's'标志以兼容低版本ES
  const gRegex = /<g[^>]*>.*?<\/g>/g;
  let gMatch;
  while ((gMatch = gRegex.exec(svgString)) !== null) {
    const gElement = gMatch[0];
    
    // 检查g元素中是否包含image元素
    const imageRegex = /<image xlink:href="data:image\/png;base64[^>]+>/g;
    let imageMatch;
    while ((imageMatch = imageRegex.exec(gElement)) !== null) {
      const imageElement = imageMatch[0];
      
      // 提取base64数据
      const base64Match = imageElement.match(/xlink:href="data:image\/png;base64,([^"]+)"/);
      // 提取宽度和高度
      const widthMatch = imageElement.match(/width="([^"]+)"/);
      const heightMatch = imageElement.match(/height="([^"]+)"/);
      // 提取x和y位置
      const xMatch = imageElement.match(/x="([^"]+)"/);
      const yMatch = imageElement.match(/y="([^"]+)"/);
      
      if (base64Match && widthMatch && heightMatch) {
        const base64Data = base64Match[1];
        const width = parseFloat(widthMatch[1]);
        const height = parseFloat(heightMatch[1]);
        const x = xMatch ? parseFloat(xMatch[1]) : 0;
        const y = yMatch ? parseFloat(yMatch[1]) : 0;
        
        // 生成图片标识符
        const imageId = `image_${imageIndex++}`;
        imageDataMap[imageId] = { base64Data, width, height, x, y };
        console.log(`从SVG中提取到图片数据 ${imageId} (位置: ${x},${y})`);
      }
    }
  }
  
  console.log(`总共从SVG中提取到 ${Object.keys(imageDataMap).length} 张图片数据`);
  return imageDataMap;
}

/**
 * 从SVG中提取图片的transform矩阵信息
 * @param svgString SVG文件内容
 * @returns 提取到的transform矩阵字符串，如果没有找到则返回默认值
 */
function extractImageTransformFromSvg(svgString: string): string {
  // 尝试从SVG中查找包含image元素的g元素的transform属性
  const gTransformMatch = svgString.match(/<g[^>]*transform="([^"]*)"[^>]*>\s*<image/);
  
  if (gTransformMatch && gTransformMatch[1]) {
    console.log('从SVG中提取到图片transform信息:', gTransformMatch[1]);
    return gTransformMatch[1];
  }
  
  // 如果没有找到特定的transform，尝试查找任何包含matrix的transform
  const matrixMatch = svgString.match(/transform="(matrix\([^)]+\))"/);
  
  if (matrixMatch && matrixMatch[1]) {
    console.log('从SVG中提取到matrix信息:', matrixMatch[1]);
    return matrixMatch[1];
  }
  
  // 如果都没有找到，返回默认的transform
  console.log('使用默认的图片transform信息');
  return 'matrix(1, 0, 0, 1, 8.1518, 745.2785)';
}

/**
 * 修复SVG文件，为image类型添加实际的图片数据元素
 * 此函数确保图片数据能够正确保存到目标文件中
 * @param svgString SVG文件内容
 * @returns 修复后的SVG文件内容和提取的所有图片数据
 */
function fixSvgImageData(svgString: string): { fixedSvg: string, imageData: Record<string, { base64Data: string, width: number, height: number, x: number, y: number }> } {
  // 首先尝试提取所有图片数据
  const imageDataMap = extractImageDataFromSvg(svgString);
  // 提取图片的transform信息
  const imageTransform = extractImageTransformFromSvg(svgString);
  
  // 检查是否包含image类型的metadata
  if (svgString.includes('"type": "image"')) {
    console.log('检测到SVG包含image类型，修复图片数据...');
    
    // 查找<defs/>和<metadata>之间的位置
    const defsIndex = svgString.indexOf('<defs/>');
    const metadataIndex = svgString.indexOf('<metadata>');
    
    if (defsIndex !== -1 && metadataIndex !== -1 && defsIndex < metadataIndex) {
      // 在<defs/>和<metadata>之间插入实际的图片数据元素
      const insertPosition = defsIndex + '<defs/>'.length;
      
      let imageDataElements = '';
      
      // 如果有提取到的图片数据，使用实际数据和提取的transform信息
      if (Object.keys(imageDataMap).length > 0) {
        // 为每张图片创建一个g元素
        Object.entries(imageDataMap).forEach(([imageId, imageData], index) => {
          // 为不同图片应用不同的位置偏移，避免重叠
          const offsetX = index * 10; // 简单的水平偏移
          const offsetY = index * 10; // 简单的垂直偏移
          
          // 修改transform以包含偏移量
          let adjustedTransform = imageTransform;
          if (imageTransform.includes('matrix')) {
            // 尝试在matrix中添加偏移
            const matrixMatch = imageTransform.match(/matrix\(([^\)]+)\)/);
            if (matrixMatch && matrixMatch[1]) {
              const matrixParts = matrixMatch[1].split(',').map(Number);
              if (matrixParts.length >= 6) {
                // 修改最后两个值（平移）
                matrixParts[4] = matrixParts[4] + offsetX;
                matrixParts[5] = matrixParts[5] + offsetY;
                adjustedTransform = `matrix(${matrixParts.join(', ')})`;
              }
            }
          }
          
          imageDataElements += `\n  <g id=\"image_${imageId}\" transform=\"${adjustedTransform}\" opacity=\"1\"><image xlink:href=\"data:image/png;base64,${imageData.base64Data}\" width=\"${imageData.width}\" height=\"${imageData.height}\" aria-label=\"${imageId}\"/></g>`;
          console.log(`使用从SVG中提取的实际图片数据 ${imageId} 和transform信息`);
        });
      } else {
        // 如果没有找到实际的图片数据，使用默认的占位数据和提取的transform信息
        imageDataElements = `\n  <g transform=\"${imageTransform}\" opacity=\"1\"><image xlink:href=\"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwACHwGA60e6kgAAAABJRU5ErkJggg==\" width=\"340.3564406818756\" height=\"652.5305009251246\" aria-label=\"default_image\"/></g>`;
        console.log('使用默认图片数据和提取的transform信息');
        // 添加默认图片到map中
        imageDataMap['default_image'] = { 
          base64Data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwACHwGA60e6kgAAAABJRU5ErkJggg==', 
          width: 340.3564406818756, 
          height: 652.5305009251246,
          x: 0,
          y: 0
        };
      }
      
      const fixedSvg = svgString.slice(0, insertPosition) + imageDataElements + svgString.slice(insertPosition);
      console.log(`已为image类型添加 ${Object.keys(imageDataMap).length} 个实际图片数据元素，确保保存时包含完整图片数据`);
      return { fixedSvg, imageData: imageDataMap };
    }
  }
  
  // 确保所有图片数据项都包含x和y属性
  Object.keys(imageDataMap).forEach(imageKey => {
    const imageDataItem = imageDataMap[imageKey] as { base64Data: string, width: number, height: number, x?: number, y?: number };
    if (!('x' in imageDataItem)) {
      imageDataItem.x = 0;
    }
    if (!('y' in imageDataItem)) {
      imageDataItem.y = 0;
    }
  });
  
  return { fixedSvg: svgString, imageData: imageDataMap };
}
// 【辅助函数】这是一个非常简单和安全的函数，只对路径坐标应用缩放。
function applyScaleMatrixToPathD(d: string, matrix: [number, number, number, number, number, number]): string {
    const [a, _, __, d_mat, ___, ____] = matrix;
    const commands = d.match(/[a-zA-Z][^a-zA-Z]*/g);
    if (!commands) return d;

    return commands.map(commandStr => {
        const type = commandStr[0];
        const params = (commandStr.slice(1).match(/-?[\d.eE+-]+/g) || []).map(parseFloat);
        let newParams: number[] = [];

        switch (type.toUpperCase()) {
            case 'H': // 水平线
                newParams = params.map(p => p * a);
                return type + newParams.join(' ');
            case 'V': // 垂直线
                newParams = params.map(p => p * d_mat);
                return type + newParams.join(' ');
            default: // 其他所有命令 (M, L, C, Q, S, T, A)
                for (let i = 0; i < params.length; i += 2) {
                    if (params[i] !== undefined) newParams.push(params[i] * a);
                    if (params[i+1] !== undefined) newParams.push(params[i+1] * d_mat);
                }
                return type + newParams.join(' ');
        }
    }).join('');
}

/**
 * 解析SVG文件并转换为tldraw形状数据
 * @param svgString SVG文件内容
 * @returns 解析后的形状数据数组和提取的所有图片数据
 */
function parseSvgToShapes(svgString: string): {
  shapes: SvgShapeData[],
  imageData: Record<string, { base64Data: string, width: number, height: number, x: number, y: number }>
} {
  try {
    // ---------- helpers：矩阵与点变换 ----------
    const IDENTITY: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];

    // 矩阵乘法：返回 m1 * m2 （注意顺序：先应用 m2，再应用 m1）
    function multiplyMatrices(
      m1: [number, number, number, number, number, number],
      m2: [number, number, number, number, number, number]
    ): [number, number, number, number, number, number] {
      const [a1, b1, c1, d1, e1, f1] = m1;
      const [a2, b2, c2, d2, e2, f2] = m2;
      const a = a1 * a2 + c1 * b2;
      const b = b1 * a2 + d1 * b2;
      const c = a1 * c2 + c1 * d2;
      const d = b1 * c2 + d1 * d2;
      const e = a1 * e2 + c1 * f2 + e1;
      const f = b1 * e2 + d1 * f2 + f1;
      return [a, b, c, d, e, f];
    }

    // 将 transform 字符串解析为矩阵（保持 transform 命令出现的顺序）
    function parseMatrixFromTransformString(transform?: string | null): [number, number, number, number, number, number] {
      if (!transform) return IDENTITY;
      const re = /([a-zA-Z]+)\(([^)]+)\)/g;
      let match: RegExpExecArray | null;
      let mat: [number, number, number, number, number, number] = IDENTITY;
      while ((match = re.exec(transform))) {
        const cmd = match[1];
        const raw = (match[2] || '').trim();
        const nums = raw.length ? raw.split(/[\s,]+/).map(s => parseFloat(s)).filter(n => !Number.isNaN(n)) : [];
        switch (cmd) {
          case 'matrix':
            if (nums.length >= 6) mat = multiplyMatrices(mat, [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]]);
            break;
          case 'translate': {
            const tx = nums[0] || 0;
            const ty = nums.length >= 2 ? nums[1] : 0;
            mat = multiplyMatrices(mat, [1, 0, 0, 1, tx, ty]);
            break;
          }
          case 'scale': {
            const sx = nums.length >= 1 ? nums[0] : 1;
            const sy = nums.length >= 2 ? nums[1] : sx;
            mat = multiplyMatrices(mat, [sx, 0, 0, sy, 0, 0]);
            break;
          }
          case 'rotate': {
            const ang = (nums[0] || 0) * Math.PI / 180;
            const cos = Math.cos(ang);
            const sin = Math.sin(ang);
            if (nums.length >= 3) {
              const cx = nums[1], cy = nums[2];
              mat = multiplyMatrices(mat, [1, 0, 0, 1, cx, cy]);
              mat = multiplyMatrices(mat, [cos, sin, -sin, cos, 0, 0]);
              mat = multiplyMatrices(mat, [1, 0, 0, 1, -cx, -cy]);
            } else {
              mat = multiplyMatrices(mat, [cos, sin, -sin, cos, 0, 0]);
            }
            break;
          }
          case 'skewX': {
            const a = (nums[0] || 0) * Math.PI / 180;
            mat = multiplyMatrices(mat, [1, 0, Math.tan(a), 1, 0, 0]);
            break;
          }
          case 'skewY': {
            const a = (nums[0] || 0) * Math.PI / 180;
            mat = multiplyMatrices(mat, [1, Math.tan(a), 0, 1, 0, 0]);
            break;
          }
        }
      }
      return mat;
    }

    // 精确按矩阵计算点（不做额外 heuristic 补偿）
    function applyMatrixToPoint(matrix: [number, number, number, number, number, number], x: number, y: number) {
      const [a, b, c, d, e, f] = matrix;
      return { x: a * x + c * y + e, y: b * x + d * y + f };
    }

    // ---------- end helpers ----------

    // 先修复 SVG（A 的逻辑），并取出 imageData
    const { fixedSvg, imageData }: { fixedSvg: string, imageData: Record<string, { base64Data: string, width: number, height: number, x: number, y: number }> } = fixSvgImageData(svgString || '');

    // 清理 xml/doctypes（对大文件采用保守策略）
    let cleanedSvgString = fixedSvg;
    const isLargeFile = (svgString || '').length > 100000;
    if (!isLargeFile) {
      cleanedSvgString = fixedSvg.replace(/<\?xml[^>]*\?>/gi, '').replace(/<!DOCTYPE[^>]*>/gi, '').trim();
      if (!cleanedSvgString.trim()) cleanedSvgString = fixedSvg;
    } else {
      cleanedSvgString = fixedSvg.replace(/<\?xml[^>]*\?>/gi, '').trim();
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanedSvgString, 'image/svg+xml');
    const parseError = doc.getElementsByTagName('parsererror');
    if (parseError.length > 0) {
      // 备用解析策略尝试
      if (isLargeFile) {
        try {
          const fallbackDoc = parser.parseFromString(fixedSvg, 'image/svg+xml');
          const fallbackParseError = fallbackDoc.getElementsByTagName('parsererror');
          if (fallbackParseError.length === 0) {
            // 如果 fallback 可以解析，调用回退解析（如果你有 parseSvgToShapesFallback 可以用）
            if (typeof (parseSvgToShapesFallback as any) === 'function') {
              return parseSvgToShapesFallback(fallbackDoc, imageData, svgString.length);
            }
          }
        } catch (e) {
          console.warn('fallback parse failed', e);
        }
      }
      console.warn('SVG parse error:', parseError[0].textContent || 'unknown');
      return { shapes: [], imageData: {} };
    }

    const svgElement = doc.documentElement;
    if (!svgElement || svgElement.tagName.toLowerCase() !== 'svg') {
      console.warn('Invalid SVG root');
      return { shapes: [], imageData: {} };
    }

    // 处理 viewBox：我们把 viewBox origin (vx,vy) 保存下来，最终从每个坐标中减去它
    // （即 final = transformedPoint - viewBoxOrigin）
    let viewBoxOrigin = { x: 0, y: 0 };
    const viewBoxAttr = svgElement.getAttribute('viewBox');
    if (viewBoxAttr) {
      const parts = viewBoxAttr.split(/[\s,]+/).map(s => parseFloat(s));
      if (parts.length >= 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
        viewBoxOrigin = { x: parts[0], y: parts[1] };
      }
    }

    // shapes 列表
    const shapes: SvgShapeData[] = [];

    // 优先解析 metadata（如果存在 tldraw 导出数据）
    let hasMetadataShapes = false;
    const metadataElement = svgElement.getElementsByTagName('metadata')[0];
    if (metadataElement) {
      const tldrawElement = metadataElement.getElementsByTagName('tldraw')[0];
      if (tldrawElement) {
        try {
          const tldrawData = JSON.parse(tldrawElement.textContent || '{}');
          if (tldrawData.document && tldrawData.document.store) {
            const store = tldrawData.document.store;
            const assetMap = new Map<string, any>();
            for (const key in store) {
              if (key.startsWith('asset:')) assetMap.set(store[key].id, store[key]);
            }
            const shapeKeys = Object.keys(store).filter(k => k.startsWith('shape:'));
            shapeKeys.sort((a, b) => {
              const nA = parseInt(a.replace('shape:', '')) || 0;
              const nB = parseInt(b.replace('shape:', '')) || 0;
              return nA - nB;
            });
            for (const key of shapeKeys) {
              const si = store[key];
              const shape: SvgShapeData = {
                id: si.id,
                type: si.type,
                x: si.x || 0,
                y: si.y || 0,
                rotation: si.rotation || 0,
                opacity: si.opacity != null ? si.opacity : 1,
              } as any;
              if (si.props) Object.assign(shape, si.props);
              shapes.push(shape);
            }
            hasMetadataShapes = shapeKeys.length > 0;
          }
        } catch (e) {
          console.warn('Failed to parse tldraw metadata', e);
        }
      }
    }

    // 解析元素的主函数：接收合并后的父矩阵 parentMatrix
    const parseElement = (element: Element, parentMatrix: [number, number, number, number, number, number], parentOpacity: number) => {
      const tagName = element.tagName.toLowerCase();

      // 如果存在 metadata shapes，则仅解析 <g> 的子节点以确保嵌套被遍历，但跳过其它普通元素
      if (hasMetadataShapes && tagName !== 'metadata') {
        if (tagName === 'g') {
          const children = element.childNodes || [];
          for (let i = 0; i < children.length; i++) {
            const ch = children[i];
            if (ch.nodeType === 1) parseElement(ch as Element, parentMatrix, parentOpacity);
          }
        }
        return;
      }

      // 计算当前元素的 local 矩阵并合并到父矩阵上
      const localTransformStr = element.getAttribute('transform') || null;
      const localMatrix = parseMatrixFromTransformString(localTransformStr);
      const combinedMatrix = multiplyMatrices(localMatrix, parentMatrix); // 修改为 local 先

      // opacity 继承
      const elOpacityAttr = element.getAttribute('opacity');
      const elOpacity = elOpacityAttr ? parseFloat(elOpacityAttr) : 1;
      const curOpacity = parentOpacity * elOpacity;

      // 优先处理 tldraw 导出元素（data-*）
      const isTldrawShape = element.getAttribute('data-tldraw') === 'true' ||
                            !!element.getAttribute('data-type') ||
                            tagName === 'metadata';
      if (isTldrawShape) {
        if (tagName === 'metadata') return;
        const shapeType = element.getAttribute('data-type') || 'draw';
        const sid = element.getAttribute('id') || createShapeId();
        const shape: SvgShapeData = { id: sid, type: shapeType as any, transform: localTransformStr || undefined, x: 0, y: 0 } as any;
        if (shapeType === 'draw') {
          const segAttr = element.getAttribute('data-segments');
          if (segAttr) {
            try { shape.segments = JSON.parse(segAttr); } catch (e) { console.warn('parse segments error', e); }
          }
          shape.isComplete = element.getAttribute('data-isComplete') === 'true';
          shape.isPen = element.getAttribute('data-isPen') === 'true';
        } else if (shapeType === 'geo') {
          shape.geo = element.getAttribute('data-geo') || 'rectangle';
          shape.w = parseFloat(element.getAttribute('data-w') || '100');
          shape.h = parseFloat(element.getAttribute('data-h') || '100');
        } else if (shapeType === 'image') {
          shape.assetId = element.getAttribute('data-assetId') || undefined;
          shape.w = parseFloat(element.getAttribute('data-w') || '100');
          shape.h = parseFloat(element.getAttribute('data-h') || '100');
        }
        shape.opacity = curOpacity;
        // color/fill/… 保持原有的 getTldrawStyleAndOpacity 逻辑，如果需要可以 merge
        const { styles } = getTldrawStyleAndOpacity(element, undefined, curOpacity);
        Object.assign(shape, styles);
        shapes.push(shape);
        return;
      }

      // 普通元素处理
      const sid = createShapeId();
      const { styles, opacity: styleOpacity } = getTldrawStyleAndOpacity(element, undefined, curOpacity);

      switch (tagName) {
        case 'g': {
          // 递归合并矩阵到子元素（combinedMatrix）
          const children = element.childNodes || [];
          for (let i = 0; i < children.length; i++) {
            const ch = children[i];
            if (ch.nodeType === 1) parseElement(ch as Element, combinedMatrix, curOpacity);
          }
          break;
        }

        case 'rect': {
          const x = parseFloat(element.getAttribute('x') || '0');
          const y = parseFloat(element.getAttribute('y') || '0');
          const w = parseFloat(element.getAttribute('width') || '0');
          const h = parseFloat(element.getAttribute('height') || '0');
          if (w > 0 && h > 0) {
            // 矩阵分离：将combinedMatrix分离为平移分量和非平移矩阵
            const tx = combinedMatrix[4]; // 平移X分量
            const ty = combinedMatrix[5]; // 平移Y分量
            const nonTranslationMatrix: [number, number, number, number, number, number] = [
              combinedMatrix[0], combinedMatrix[1], combinedMatrix[2], 
              combinedMatrix[3], 0, 0 // 移除平移分量
            ];
            
            // 只对点应用非平移矩阵
            const p1 = applyMatrixToPoint(nonTranslationMatrix, x, y);
            const p2 = applyMatrixToPoint(nonTranslationMatrix, x + w, y);
            const p3 = applyMatrixToPoint(nonTranslationMatrix, x + w, y + h);
            const p4 = applyMatrixToPoint(nonTranslationMatrix, x, y + h);
            const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
            const minY = Math.min(p1.y, p2.y, p3.y, p4.y);
            const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
            const maxY = Math.max(p1.y, p2.y, p3.y, p4.y);
            
            // 最终形状位置由三部分组成：平移分量 + 相对边界框左上角 + ViewBox偏移
            const finalX = tx + minX - viewBoxOrigin.x;
            const finalY = ty + minY - viewBoxOrigin.y;
            
            shapes.push({
              id: sid, type: 'geo', x: finalX, y: finalY,
              w: maxX - minX, h: maxY - minY, geo: 'rectangle', opacity: styleOpacity, ...styles,
            });
          }
          break;
        }

        case 'circle': {
          const cx = parseFloat(element.getAttribute('cx') || '0');
          const cy = parseFloat(element.getAttribute('cy') || '0');
          const r = parseFloat(element.getAttribute('r') || '0');
          if (r > 0) {
            // 矩阵分离：将combinedMatrix分离为平移分量和非平移矩阵
            const tx = combinedMatrix[4]; // 平移X分量
            const ty = combinedMatrix[5]; // 平移Y分量
            const nonTranslationMatrix: [number, number, number, number, number, number] = [
              combinedMatrix[0], combinedMatrix[1], combinedMatrix[2], 
              combinedMatrix[3], 0, 0 // 移除平移分量
            ];
            
            // 只对中心点应用非平移矩阵
            const p = applyMatrixToPoint(nonTranslationMatrix, cx, cy);
            
            // 计算缩放因子（从矩阵中提取）
            const scaleX = Math.sqrt(combinedMatrix[0] * combinedMatrix[0] + combinedMatrix[1] * combinedMatrix[1]);
            const scaleY = Math.sqrt(combinedMatrix[2] * combinedMatrix[2] + combinedMatrix[3] * combinedMatrix[3]);
            const avgScale = (scaleX + scaleY) / 2; // 使用平均缩放
            
            // 最终形状位置由三部分组成：平移分量 + 相对边界框左上角 + ViewBox偏移
            const finalX = tx + p.x - r * avgScale - viewBoxOrigin.x;
            const finalY = ty + p.y - r * avgScale - viewBoxOrigin.y;
            
            shapes.push({
              id: sid, type: 'geo', x: finalX, y: finalY,
              w: r * 2 * avgScale, h: r * 2 * avgScale, geo: 'ellipse', opacity: styleOpacity, ...styles,
            });
          }
          break;
        }

        case 'ellipse': {
          const ecx = parseFloat(element.getAttribute('cx') || '0');
          const ecy = parseFloat(element.getAttribute('cy') || '0');
          const rx = parseFloat(element.getAttribute('rx') || '0');
          const ry = parseFloat(element.getAttribute('ry') || '0');
          if (rx > 0 && ry > 0) {
            // 矩阵分离：将combinedMatrix分离为平移分量和非平移矩阵
            const tx = combinedMatrix[4]; // 平移X分量
            const ty = combinedMatrix[5]; // 平移Y分量
            const nonTranslationMatrix: [number, number, number, number, number, number] = [
              combinedMatrix[0], combinedMatrix[1], combinedMatrix[2], 
              combinedMatrix[3], 0, 0 // 移除平移分量
            ];
            
            // 只对中心点应用非平移矩阵
            const p = applyMatrixToPoint(nonTranslationMatrix, ecx, ecy);
            
            // 计算缩放因子（从矩阵中提取）
            const scaleX = Math.sqrt(combinedMatrix[0] * combinedMatrix[0] + combinedMatrix[1] * combinedMatrix[1]);
            const scaleY = Math.sqrt(combinedMatrix[2] * combinedMatrix[2] + combinedMatrix[3] * combinedMatrix[3]);
            
            // 最终形状位置由三部分组成：平移分量 + 相对边界框左上角 + ViewBox偏移
            const finalX = tx + p.x - rx * scaleX - viewBoxOrigin.x;
            const finalY = ty + p.y - ry * scaleY - viewBoxOrigin.y;
            
            shapes.push({
              id: sid, type: 'geo', x: finalX, y: finalY,
              w: rx * 2 * scaleX, h: ry * 2 * scaleY, geo: 'ellipse', opacity: styleOpacity, ...styles,
            });
          }
          break;
        }

        case 'line': {
          const x1 = parseFloat(element.getAttribute('x1') || '0');
          const y1 = parseFloat(element.getAttribute('y1') || '0');
          const x2 = parseFloat(element.getAttribute('x2') || '0');
          const y2 = parseFloat(element.getAttribute('y2') || '0');
          
          // 矩阵分离：将combinedMatrix分离为平移分量和非平移矩阵
          const tx = combinedMatrix[4]; // 平移X分量
          const ty = combinedMatrix[5]; // 平移Y分量
          const nonTranslationMatrix: [number, number, number, number, number, number] = [
            combinedMatrix[0], combinedMatrix[1], combinedMatrix[2], 
            combinedMatrix[3], 0, 0 // 移除平移分量
          ];
          
          // 只对点应用非平移矩阵
          const p1 = applyMatrixToPoint(nonTranslationMatrix, x1, y1);
          const p2 = applyMatrixToPoint(nonTranslationMatrix, x2, y2);
          const d = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
          const minX = Math.min(p1.x, p2.x), minY = Math.min(p1.y, p2.y);
          
          // 最终形状位置由三部分组成：平移分量 + 相对边界框左上角 + ViewBox偏移
          const finalX = tx + minX - viewBoxOrigin.x;
          const finalY = ty + minY - viewBoxOrigin.y;
          
          shapes.push({
            id: sid, type: 'path', d, x: finalX, y: finalY, opacity: styleOpacity, ...styles
          });
          break;
        }

        case 'polyline':
        case 'polygon': {
          const ptsAttr = element.getAttribute('points') || '';
          const tokens = ptsAttr.trim().split(/[\s,]+/).filter(Boolean);
          if (tokens.length >= 2) {
            // 矩阵分离：将combinedMatrix分离为平移分量和非平移矩阵
            const tx = combinedMatrix[4]; // 平移X分量
            const ty = combinedMatrix[5]; // 平移Y分量
            const nonTranslationMatrix: [number, number, number, number, number, number] = [
              combinedMatrix[0], combinedMatrix[1], combinedMatrix[2], 
              combinedMatrix[3], 0, 0 // 移除平移分量
            ];
            
            // 只对点应用非平移矩阵，计算相对边界框
            const pts: { x: number, y: number }[] = [];
            for (let i = 0; i + 1 < tokens.length; i += 2) {
              const px = parseFloat(tokens[i] || '0');
              const py = parseFloat(tokens[i + 1] || '0');
              pts.push(applyMatrixToPoint(nonTranslationMatrix, px, py));
            }
            if (pts.length) {
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
              let d = `M ${pts[0].x - minX} ${pts[0].y - minY} `;
              for (let i = 1; i < pts.length; i++) d += `L ${pts[i].x - minX} ${pts[i].y - minY} `;
              if (tagName === 'polygon') d += 'Z';
              
              // 最终形状位置由三部分组成：平移分量 + 相对边界框左上角 + ViewBox偏移
              const finalX = tx + minX - viewBoxOrigin.x;
              const finalY = ty + minY - viewBoxOrigin.y;
              
              shapes.push({
                id: sid, type: 'path', d: d.trim(), x: finalX, y: finalY, opacity: styleOpacity, ...styles
              });
            }
          }
          break;
        }

        case 'path': {
          let dRaw = element.getAttribute('d');
          if (!dRaw) break;

          // 1. 【预处理】应用缩放，解决 potrace 的巨大坐标问题
          //    我们保留 applyScaleMatrixToPathD，因为它被证明是有效的。
          const preScaleMatrix: [number, number, number, number, number, number] = [combinedMatrix[0], 0, 0, combinedMatrix[3], 0, 0];
          const scaledD = applyScaleMatrixToPathD(dRaw, preScaleMatrix);

          // 2. 【分流】判断路径类型
          const isHandDrawnPath = scaledD.includes('Q') || scaledD.includes('q') || scaledD.includes('T') || scaledD.includes('t');

          let segments: TLDrawSegment[];

          if (isHandDrawnPath) {
            // 3a. 如果是手绘路径 (Q/T)，我们必须绕过 reverseSvgPathToSegments 的二次采样。
            //     最简单的方法是，我们自己做一个超轻量级的采样。
            //     我们将使用 reverseSvgPathToSegments，但给它一个极小的采样值！
            segments = reverseSvgPathToSegments(scaledD, { bezierSegments: 2, arcSegments: 2 });
          } else {
            // 3b. 如果是几何路径 (M/L/C/Z)，使用我们修复好的、有动态Epsilon的 reverseSvgPathToSegments。
            segments = reverseSvgPathToSegments(scaledD, { bezierSegments: 24, arcSegments: 36 });
          }

          if (!segments || segments.length === 0) break;

          // 4. 【后处理】应用平移
          const e = combinedMatrix[4];
          const f = combinedMatrix[5];
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const seg of segments) {
            for (const p of seg.points) {
              p.x += e;
              p.y += f;
              minX = Math.min(minX, p.x);
              minY = Math.min(minY, p.y);
              maxX = Math.max(maxX, p.x);
              maxY = Math.max(maxY, p.y);
            }
          }
          if (!isFinite(minX)) break;

          // 5. 创建 Shape (后续逻辑保持不变)
          const finalSegments = segments.map(seg => ({
              ...seg,
              points: seg.points.map(p => ({ x: p.x - minX, y: p.y - minY, z: p.z }))
          }));
          const finalX = minX - viewBoxOrigin.x;
          const finalY = minY - viewBoxOrigin.y;

          shapes.push({
            id: createShapeId(),
            type: 'draw',
            x: finalX,
            y: finalY,
            w: (maxX - minX) || 1,
            h: (maxY - minY) || 1,
            opacity: styleOpacity,
            ...styles,
            segments: finalSegments,
            isComplete: true,
            isClosed: dRaw.trim().toUpperCase().endsWith('Z'),
          });

          break;
        }

        case 'image': {
          // 参考 A 的处理，优先使用 fixSvgImageData 中的资源标识
          const x = parseFloat(element.getAttribute('x') || '0');
          const y = parseFloat(element.getAttribute('y') || '0');
          const w = parseFloat(element.getAttribute('width') || '0');
          const h = parseFloat(element.getAttribute('height') || '0');
          const href = element.getAttribute('xlink:href') || element.getAttribute('href') || '';
          if (w > 0 && h > 0 && href) {
            // 矩阵分离：将combinedMatrix分离为平移分量和非平移矩阵
            const tx = combinedMatrix[4]; // 平移X分量
            const ty = combinedMatrix[5]; // 平移Y分量
            const nonTranslationMatrix: [number, number, number, number, number, number] = [
              combinedMatrix[0], combinedMatrix[1], combinedMatrix[2], 
              combinedMatrix[3], 0, 0 // 移除平移分量
            ];
            
            // 只对位置点应用非平移矩阵，宽高可能受缩放影响
            const p = applyMatrixToPoint(nonTranslationMatrix, x, y);
            
            // 计算缩放因子（从矩阵中提取）
            const scaleX = Math.sqrt(combinedMatrix[0] * combinedMatrix[0] + combinedMatrix[1] * combinedMatrix[1]);
            const scaleY = Math.sqrt(combinedMatrix[2] * combinedMatrix[2] + combinedMatrix[3] * combinedMatrix[3]);
            
            // asset id 规范化
            const assetId = href.startsWith('asset:') ? href : `asset:${href}`;
            
            // 最终形状位置由三部分组成：平移分量 + 相对边界框左上角 + ViewBox偏移
            const finalX = tx + p.x - viewBoxOrigin.x;
            const finalY = ty + p.y - viewBoxOrigin.y;
            
            shapes.push({
              id: sid,
              type: 'image',
              x: finalX,
              y: finalY,
              w: w * scaleX, // 应用缩放
              h: h * scaleY, // 应用缩放
              assetId,
              opacity: styleOpacity,
              ...styles,
            });
          }
          break;
        }

        case 'text': {
          const x = parseFloat(element.getAttribute('x') || '0');
          const y = parseFloat(element.getAttribute('y') || '0');
          const textContent = element.textContent || '';
          if (textContent.trim()) {
            // 矩阵分离：将combinedMatrix分离为平移分量和非平移矩阵
            const tx = combinedMatrix[4]; // 平移X分量
            const ty = combinedMatrix[5]; // 平移Y分量
            const nonTranslationMatrix: [number, number, number, number, number, number] = [
              combinedMatrix[0], combinedMatrix[1], combinedMatrix[2], 
              combinedMatrix[3], 0, 0 // 移除平移分量
            ];
            
            // 只对位置点应用非平移矩阵
            const p = applyMatrixToPoint(nonTranslationMatrix, x, y);
            
            // 最终形状位置由三部分组成：平移分量 + 相对边界框左上角 + ViewBox偏移
            const finalX = tx + p.x - viewBoxOrigin.x;
            const finalY = ty + p.y - viewBoxOrigin.y;
            
            shapes.push({
              id: sid, type: 'text',
              x: finalX, y: finalY,
              w: 200, h: 100, text: textContent,
              font: 'draw', align: 'middle', verticalAlign: 'middle',
              opacity: styleOpacity, ...styles
            });
          }
          break;
        }

        default: {
          // 递归到子节点（使用 combinedMatrix）
          const children = element.childNodes || [];
          for (let i = 0; i < children.length; i++) {
            const ch = children[i];
            if (ch.nodeType === 1) parseElement(ch as Element, combinedMatrix, curOpacity);
          }
          break;
        }
      }
    };

    // 从根元素遍历（根矩阵为 IDENTITY）
    const rootChildren = svgElement.childNodes || [];
    for (let i = 0; i < rootChildren.length; i++) {
      const ch = rootChildren[i];
      if (ch.nodeType === 1) parseElement(ch as Element, IDENTITY, 1);
    }

    return { shapes, imageData };
  } catch (err) {
    console.error('Error parsing SVG (reworked):', err);
    return { shapes: [], imageData: {} };
  }
}
/**
 * 将SVG形状数据添加到tldraw编辑器中
 */
// 创建 shape 的小封装
function createTlShapeSafe(editor: Editor, shapeArgs: any): TLShape {
  const id = shapeArgs.id ?? createShapeId()
  shapeArgs.id = id
  editor.createShape(shapeArgs)
  const sh = editor.getShape(id)
  if (!sh) throw new Error(`createShape failed id=${id}`)
  return sh as TLShape
}
/**
 * 主函数：把 SvgShapeData 数组创建到 editor 中
 *
 * 说明关键点：
 * - rootOffsets (offsetX/offsetY) 只应用在根级 shape（避免二次偏移）
 * - metadataShapes（含 segments）直接使用 segments，不重复解析 d
 * - non-metadata path 使用 reverseSvgPathToSegments 恢复点数据
 * - path/type -> 以 draw 类型导入（tldraw 支持），避免 type="path" 的 util 缺失
 * - 不把 opacity 放入 props（放到顶级字段）
 */
export function addSvgShapesToEditor(
  editor: Editor,
  shapes: SvgShapeData[],
  canvasCenterX: number = 0,
  canvasCenterY: number = 0,
  imageData: Record<string, { base64Data: string; width: number; height: number }> = {},
  disableAutoCenter: boolean = false
): TLShape[] {
  const created: TLShape[] = []
  
  // 生成颜色映射表
  const colorMap = generateColorMapFromPalette()

  // 安全检查 util 存在
  const safeNumber = (v: any, fallback = 0) => (Number.isFinite(v) ? v : fallback)

  // 递归创建（parentId 传入）
  const createRecursive = (shape: SvgShapeData, parentId?: string, isRoot = false) => {
    // 只在根级应用偏移（避免二次偏移）
    if (isRoot && !disableAutoCenter) {
      shape.x = (shape.x ?? 0) + canvasCenterX
      shape.y = (shape.y ?? 0) + canvasCenterY
    }

    const id = shape.id ?? createShapeId()

    // unify type mapping:
    // - if incoming shape.type === 'path' (from SVG), convert to draw
    // - if incoming shape.type === 'path' but already has segments (metadata) keep segments
    const base: any = {
      id,
      parentId: parentId,
      x: safeNumber(shape.x, 0),
      y: safeNumber(shape.y, 0),
      rotation: safeNumber(shape.rotation, 0),
      opacity: (shape.opacity !== undefined && shape.opacity !== null) ? shape.opacity : 1,
    }

    // build shape args depending on type
    if (shape.type === 'draw') {
      // draw from metadata: use shape.segments if exists, else use convertSvgPathToSegments for ink format d
      let segments: any[] = []
      let isClosed = shape.isClosed ?? false
      if (Array.isArray(shape.segments) && shape.segments.length > 0) {
        // metadataShapes: 直接使用segments，不重复解析d
        segments = shape.segments
      } else if (typeof shape.d === 'string' && shape.d.trim().length > 0) {
        // assume ink format: use convertSvgPathToSegments
        const pathResult = convertSvgPathToSegments(shape.d)
        segments = pathResult.segments
        isClosed = pathResult.isClosed
      }

      // 优化isClosed推断：如果无明确isClosed，从segments推断（第一个segment起点≈终点）
      if (isClosed === undefined && segments.length > 0) {
        const firstSegment = segments[0]
        if (firstSegment && firstSegment.points && firstSegment.points.length > 1) {
          const firstPoint = firstSegment.points[0]
          const lastPoint = firstSegment.points[firstSegment.points.length - 1]
          isClosed = Math.abs(firstPoint.x - lastPoint.x) < 0.001 && Math.abs(firstPoint.y - lastPoint.y) < 0.001
        } else {
          isClosed = false
        }
      }

      const props = {
        segments,
        isComplete: shape.isComplete ?? true,
        isPen: shape.isPen ?? false,
        isClosed: isClosed ?? false,
        color: getTldrawColorFromSvg(shape.color ?? null, colorMap),
        fill: isClosed ? (shape.fill ?? 'none') : 'none',
        size: shape.size ?? 'm',
        dash: shape.dash ?? 'draw',
        scale: shape.scale ?? 1,
      }
      const shapeArgs = { ...base, type: 'draw', props }
      const tl = createTlShapeSafe(editor, shapeArgs)
      created.push(tl)
      // children
      if (Array.isArray(shape.children)) {
        for (const c of shape.children) createRecursive(c as SvgShapeData, id, false)
      }
      return
    }

    if (shape.type === 'path') {
      // normal svg path: shape.d exists -> reverseSvgPathToSegments -> create draw
      let segments: any[] = []
      let isClosed = false
      if (Array.isArray(shape.segments) && shape.segments.length > 0) {
        // metadataShapes：直接使用segments，不重复解析d
        segments = shape.segments
        isClosed = shape.isClosed ?? false;  // 从shape中取，或推断
      } else if (typeof shape.d === 'string' && shape.d.trim().length > 0) {
        // non-metadata：使用reverseSvgPathToSegments解析（统一函数）
        segments = reverseSvgPathToSegments(shape.d, { bezierSegments: 32, arcSegments: 48 })
        // 过滤 NaN 点
        segments = (segments || []).map((s: any) => ({
          ...s,
          points: (s.points || []).filter((p: any) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
        })).filter((s: any) => (s.points || []).length > 0)
      }

      // 优化isClosed推断：如果无明确isClosed，从segments推断（第一个segment起点≈终点）
      if (isClosed === undefined && segments.length > 0) {
        const firstSegment = segments[0]
        if (firstSegment && firstSegment.points && firstSegment.points.length > 1) {
          const firstPoint = firstSegment.points[0]
          const lastPoint = firstSegment.points[firstSegment.points.length - 1]
          isClosed = Math.abs(firstPoint.x - lastPoint.x) < 0.001 && Math.abs(firstPoint.y - lastPoint.y) < 0.001
        } else {
          isClosed = false
        }
      }

      if (segments && segments.length > 0) {
        const props: any = {
          segments,
          isComplete: true,
          isPen: false,
          isClosed: isClosed,
          color: getTldrawColorFromSvg(shape.color ?? null, colorMap),
          fill: isClosed ? ((shape.fill && shape.fill !== 'none') ? getTldrawFillStyleFromSvg(shape.fill) : 'none') : 'none',
          size: shape.size ?? 'm',
          dash: shape.dash ?? 'draw',
          scale: shape.scale ?? 1,
        }
        const shapeArgs = { ...base, type: 'draw', props }
        const tl = createTlShapeSafe(editor, shapeArgs)
        created.push(tl)
        if (Array.isArray(shape.children)) {
          for (const c of shape.children) createRecursive(c as SvgShapeData, tl.id as string, false)
        }
        return
      } else {
        // 没有 segments 的 path，退化到 geo
        const shapeArgs = { ...base, type: 'geo', w: shape.w ?? 10, h: shape.h ?? 10, props: { geo: 'rectangle', fill: 'none' } }
        const tl = createTlShapeSafe(editor, shapeArgs)
        created.push(tl)
        if (Array.isArray(shape.children)) {
          for (const c of shape.children) createRecursive(c as SvgShapeData, tl.id as string, false)
        }
        return
      }
    }

    // geo, image, text, arrow, note, embed, bookmark, group
    switch (shape.type) {
      case 'geo': {
        const props = {
          geo: shape.geo ?? 'rectangle',
          color: getTldrawColorFromSvg(shape.color ?? null, colorMap),
          fill: shape.fill ?? 'none',
          size: shape.size ?? 'm',
          dash: shape.dash ?? 'draw',
          scale: shape.scale ?? 1,
        }
        const shapeArgs = { ...base, type: 'geo', props, w: shape.w ?? 100, h: shape.h ?? 100 }
        const tl = createTlShapeSafe(editor, shapeArgs)
        created.push(tl)
        if (Array.isArray(shape.children)) for (const c of shape.children) createRecursive(c as SvgShapeData, tl.id as string, false)
        break
      }

      case 'image': {
        // try create assets if data exists
        try {
          const assetId = shape.assetId ?? `asset:${id}`
          if ((imageData && Object.keys(imageData).length > 0) && typeof (editor as any).createAssets === 'function') {
            // try to find matching imageData by approximate position/size
            const keys = Object.keys(imageData)
            let chosen = keys[0]

            const it = imageData[chosen]
            const dataUrl = `data:image/png;base64,${it.base64Data}`
            ;(editor as any).createAssets([{
              id: assetId,
              typeName: 'asset',
              type: 'image',
              props: { name: `imported-${chosen}`, src: dataUrl, w: it.width, h: it.height, mimeType: 'image/png', isAnimated: false },
              meta: {}
            }])
          }
          const props = { assetId, w: shape.w ?? 100, h: shape.h ?? 100 }
          const shapeArgs = { ...base, type: 'image', props }
          const tl = createTlShapeSafe(editor, shapeArgs)
          created.push(tl)
          if (Array.isArray(shape.children)) for (const c of shape.children) createRecursive(c as SvgShapeData, tl.id as string, false)
        } catch (e) {
          console.warn('image create failed, fallback to geo', e)
          const shapeArgs = { ...base, type: 'geo', props: { geo: 'rectangle', fill: shape.fill ?? 'none' }, w: shape.w ?? 100, h: shape.h ?? 100 }
          const tl = createTlShapeSafe(editor, shapeArgs)
          created.push(tl)
          if (Array.isArray(shape.children)) for (const c of shape.children) createRecursive(c as SvgShapeData, tl.id as string, false)
        }
        break
      }

      case 'text': {
        const props = {
          text: shape.text ?? '',
          font: shape.font ?? 'draw',
          align: shape.align ?? 'middle',
          verticalAlign: shape.verticalAlign ?? 'middle',
        }
        const shapeArgs = { ...base, type: 'text', props, w: shape.w ?? 200, h: shape.h ?? 100 }
        const tl = createTlShapeSafe(editor, shapeArgs)
        created.push(tl)
        if (Array.isArray(shape.children)) for (const c of shape.children) createRecursive(c as SvgShapeData, tl.id as string, false)
        break
      }

      case 'group': {
        // group as placeholder: we don't create a frame by default, but create a dummy group node using a frame (optional)
        // We'll create a frame only if needed; here just create a 'frame' to act as parent container (keeps hierarchy)
        const shapeArgs = { ...base, type: 'frame', props: {}, w: shape.w ?? 1, h: shape.h ?? 1 }
        const tl = createTlShapeSafe(editor, shapeArgs)
        created.push(tl)
        // children attach to this group's id
        if (Array.isArray(shape.children)) {
          for (const c of shape.children) createRecursive(c as SvgShapeData, tl.id as string, false)
        }
        break
      }

      case 'arrow': {
        const props = {
          start: shape.start,
          end: shape.end,
          color: getTldrawColorFromSvg(shape.color ?? null, colorMap),
          dash: shape.dash ?? 'draw'
        }
        const shapeArgs = { ...base, type: 'arrow', props }
        const tl = createTlShapeSafe(editor, shapeArgs)
        created.push(tl)
        break
      }

      default: {
        // fallback: create a small geo to preserve position
        const shapeArgs = { ...base, type: 'geo', props: { geo: 'rectangle', fill: shape.fill ?? 'none' }, w: shape.w ?? 10, h: shape.h ?? 10 }
        const tl = createTlShapeSafe(editor, shapeArgs)
        created.push(tl)
        if (Array.isArray(shape.children)) for (const c of shape.children) createRecursive(c as SvgShapeData, tl.id as string, false)
        break
      }
    }
  }

  // entry
  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i]
    try {
      createRecursive(s, undefined, true)
    } catch (e) {
      console.error('createRecursive failed for shape', s?.id, e)
    }
  }

  return created
}
/**
 * 将SVG路径数据转换为tldraw draw形状的segments格式（匹配ink生成的格式）
 * 根据tldraw的DrawShapeUtil.tsx文件，TLDrawShapeSegment的正确结构为：
 * points数组包含具有x、y、z属性的对象：[{x: number, y: number, z: number}]
 */
function convertSvgPathToSegments(d: string): { segments: any[], isClosed: boolean } {
  const segments: any[] = [];
  
  // 检查输入是否有效
  if (!d || typeof d !== 'string' || d.trim() === '') {
    console.warn('convertSvgPathToSegments: 无效的路径数据', d);
    return { segments: [], isClosed: false };
  }
  
  // 首先规范化路径数据
  let cleanedD = d.replace(/\s+/g, ' ').trim();
  
  // 不再需要预处理T命令，我们将直接处理T命令
  
  // 改进的命令解析：正确处理连续的数字和命令
  const commands: {type: string, params: number[]}[] = [];
  let i = 0;
  
  while (i < cleanedD.length) {
    const char = cleanedD[i];
    
    // 检查是否是命令字符
    if (/[A-Za-z]/.test(char)) {
      const command = char;
      i++;
      
      // 提取参数直到下一个命令或结束
      let paramsStr = '';
      while (i < cleanedD.length && !/[A-Za-z]/.test(cleanedD[i])) {
        paramsStr += cleanedD[i];
        i++;
      }
      
      // 解析参数
      const params = paramsStr.trim().split(/[\s,]+/)
        .filter(p => p.trim() !== '' && !isNaN(parseFloat(p)))
        .map(p => parseFloat(p));
      
      commands.push({ type: command, params: params });
    } else {
      i++;
    }
  }
  
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;
  
  // 跟踪前一个Q命令的控制点，用于T命令的对称控制点计算
  let lastQuadraticControlX = 0;
  let lastQuadraticControlY = 0;
  let hasLastQuadraticControl = false;
  
  const subPaths: {points: {x: number, y: number, z: number}[], isClosed: boolean}[] = [];
  let currentSubPath: {points: {x: number, y: number, z: number}[], isClosed: boolean} = { points: [], isClosed: false };
  
  for (const command of commands) {
    const type = command.type;
    const params = command.params;
    
    if (type === 'M' || type === 'm') {
      if (params.length >= 2) {
        // 开始新的子路径
        if (currentSubPath.points.length > 0) {
          subPaths.push(currentSubPath);
        }
        
        currentSubPath = { points: [], isClosed: false };
        
        if (type === 'm') {
          currentX += params[0];
          currentY += params[1];
        } else {
          currentX = params[0];
          currentY = params[1];
        }
        
        startX = currentX;
        startY = currentY;
        
        // 重置控制点记录
        hasLastQuadraticControl = false;
        
        currentSubPath.points.push({ x: currentX, y: currentY, z: 0.5 });
      }
    } else if (type === 'L' || type === 'l') {
      if (params.length >= 2) {
        if (type === 'l') {
          currentX += params[0];
          currentY += params[1];
        } else {
          currentX = params[0];
          currentY = params[1];
        }
        
        // 重置控制点记录
        hasLastQuadraticControl = false;
        
        currentSubPath.points.push({ x: currentX, y: currentY, z: 0.5 });
      }
    } else if (type === 'Z' || type === 'z') {
      // 闭合路径：添加起点并标记为闭合
      if (currentSubPath.points.length > 0) {
        currentSubPath.points.push({ x: startX, y: startY, z: 0.5 });
        currentSubPath.isClosed = true;
      }
    } else if (type === 'C' || type === 'c') {
      if (params.length >= 6) {
        const endX = type === 'c' ? currentX + params[4] : params[4];
        const endY = type === 'c' ? currentY + params[5] : params[5];
        
        // 重置控制点记录
        hasLastQuadraticControl = false;
        
        // 对于手绘形状，增加采样点数量以获得更平滑的曲线（20个点）
        const sampleCount = 20;
        for (let j = 0; j <= sampleCount; j++) {
          const t = j / sampleCount;
          const x = calculateBezierPoint(t, currentX, 
            type === 'c' ? currentX + params[0] : params[0],
            type === 'c' ? currentX + params[2] : params[2],
            endX);
          const y = calculateBezierPoint(t, currentY,
            type === 'c' ? currentY + params[1] : params[1],
            type === 'c' ? currentY + params[3] : params[3],
            endY);
          
          currentSubPath.points.push({ x: x, y: y, z: 0.5 });
        }
        
        currentX = endX;
        currentY = endY;
      }
    } else if (type === 'Q' || type === 'q') {
      if (params.length >= 4) {
        const controlX = type === 'q' ? currentX + params[0] : params[0];
        const controlY = type === 'q' ? currentY + params[1] : params[1];
        const endX = type === 'q' ? currentX + params[2] : params[2];
        const endY = type === 'q' ? currentY + params[3] : params[3];
        
        // 记录控制点，用于后续的T命令
        lastQuadraticControlX = controlX;
        lastQuadraticControlY = controlY;
        hasLastQuadraticControl = true;
        
        // 对于手绘形状，增加采样点数量（15个点）
        const sampleCount = 15;
        for (let j = 0; j <= sampleCount; j++) {
          const t = j / sampleCount;
          const x = calculateQuadraticBezierPoint(t, currentX, controlX, endX);
          const y = calculateQuadraticBezierPoint(t, currentY, controlY, endY);
          
          currentSubPath.points.push({ x: x, y: y, z: 0.5 });
        }
        
        currentX = endX;
        currentY = endY;
      }
    } else if (type === 'T' || type === 't') {
      // 处理平滑二次贝塞尔曲线（T命令）
      if (params.length >= 2) {
        const endX = type === 't' ? currentX + params[0] : params[0];
        const endY = type === 't' ? currentY + params[1] : params[1];
        
        // 计算控制点
        let controlX = currentX;
        let controlY = currentY;
        
        // 如果有前一个Q命令的控制点，计算对称控制点
        if (hasLastQuadraticControl) {
          // 对称控制点 = 当前点 + (当前点 - 前一个控制点)
          controlX = currentX + (currentX - lastQuadraticControlX);
          controlY = currentY + (currentY - lastQuadraticControlY);
        }
        
        // 更新控制点记录
        lastQuadraticControlX = controlX;
        lastQuadraticControlY = controlY;
        hasLastQuadraticControl = true;
        
        // 使用sampleQuadratic函数处理T命令
        const startPoint: TLDrawPoint = { x: currentX, y: currentY, z: 0.5 };
        const controlPoint: TLDrawPoint = { x: controlX, y: controlY, z: 0.5 };
        const endPoint: TLDrawPoint = { x: endX, y: endY, z: 0.5 };
        
        // 对于手绘形状，增加采样点数量（15个点）
        const sampled = sampleQuadratic(startPoint, controlPoint, endPoint, 15);
        
        // sampled中第一个点通常等于current，避免重复
        sampled.forEach((pt, idx) => {
          const last = currentSubPath.points[currentSubPath.points.length - 1];
          if (!last || last.x !== pt.x || last.y !== pt.y) {
            currentSubPath.points.push({ x: pt.x, y: pt.y, z: 0.5 });
          }
        });
        
        currentX = endX;
        currentY = endY;
      }
    } else if (type === 'A' || type === 'a') {
      // 椭圆弧命令：简化处理为直线
      if (params.length >= 7) {
        const endX = type === 'a' ? currentX + params[5] : params[5];
        const endY = type === 'a' ? currentY + params[6] : params[6];
        
        // 重置控制点记录
        hasLastQuadraticControl = false;
        
        // 直接添加终点
        currentSubPath.points.push({ x: endX, y: endY, z: 0.5 });
        
        currentX = endX;
        currentY = endY;
      }
    } else if (type === 'H' || type === 'h') {
      // 水平线命令
      if (params.length >= 1) {
        if (type === 'h') {
          currentX += params[0];
        } else {
          currentX = params[0];
        }
        
        // 重置控制点记录
        hasLastQuadraticControl = false;
        
        currentSubPath.points.push({ x: currentX, y: currentY, z: 0.5 });
      }
    } else if (type === 'V' || type === 'v') {
      // 垂直线命令
      if (params.length >= 1) {
        if (type === 'v') {
          currentY += params[0];
        } else {
          currentY = params[0];
        }
        
        // 重置控制点记录
        hasLastQuadraticControl = false;
        
        currentSubPath.points.push({ x: currentX, y: currentY, z: 0.5 });
      }
    }
  }
  
  // 添加最后一个子路径
  if (currentSubPath.points.length > 0) {
    subPaths.push(currentSubPath);
  }
  
  // 转换为segments格式
  for (const subPath of subPaths) {
    if (subPath.points.length > 0) {
      segments.push({
        type: 'free',
        points: subPath.points
      });
    }
  }
  
  return { 
    segments, 
    isClosed: subPaths.length > 0 && subPaths.some(p => p.isClosed) 
  };
}

/**
 * 计算三次贝塞尔曲线上的点
 */
function calculateBezierPoint(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  
  return uuu * p0 + 3 * uu * t * p1 + 3 * u * tt * p2 + ttt * p3;
}

/**
 * 计算二次贝塞尔曲线上的点
 */
function calculateQuadraticBezierPoint(t: number, p0: number, p1: number, p2: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

/**
 * 导入SVG文件到tldraw编辑器
 * 注意：此函数已重构为工具函数，业务逻辑已统一到drawing-view.tsx的file-open事件中
 */
export function importSvgToTldraw(
  editor: Editor, 
  shapes: any[], 
  imageData: Record<string, any>,
  offsetX: number = 0, 
  offsetY: number = 0,
  disableAutoCenter: boolean = false
): boolean {
  try {
    if (shapes.length === 0) {
      console.warn('No valid shapes found in SVG');
      return false;
    }
    
    addSvgShapesToEditor(editor, shapes, offsetX, offsetY, imageData, disableAutoCenter); // offsetX和offsetY实际上是画布中心坐标
    
    console.log(`Successfully imported ${shapes.length} shapes from SVG, including ${Object.keys(imageData).length} images`);
    return true;
    
  } catch (error) {
    console.error('Error importing SVG to tldraw:', error);
    return false;
  }
}

/**
 * 备用SVG解析策略：对于大型文件或复杂格式的SVG采用更宽松的解析方式
 */
function parseSvgToShapesFallback(
  doc: Document, 
  imageData: Record<string, { base64Data: string, width: number, height: number, x: number, y: number }>,
  fileSize: number
): { shapes: SvgShapeData[], imageData: Record<string, { base64Data: string, width: number, height: number, x: number, y: number }> } {
  
  console.log('使用备用解析策略处理大型SVG文件，文件大小:', fileSize, '字符');
  
  const shapes: SvgShapeData[] = [];
  const svgElement = doc.documentElement;
  
  if (!svgElement || svgElement.tagName !== 'svg') {
    console.warn('备用解析：根元素不是SVG');
    return { shapes: [], imageData };
  }
  
  // 简化解析逻辑：只处理基本的形状元素
  const shapeElements = svgElement.querySelectorAll('rect, circle, ellipse, line, polyline, polygon, path, text');
  
  console.log('备用解析：找到', shapeElements.length, '个形状元素');
  
  // 应用viewBox偏移
  const viewBox = svgElement.getAttribute('viewBox');
  let viewBoxOffsetX = 0;
  let viewBoxOffsetY = 0;
  
  if (viewBox) {
    const [vx, vy] = viewBox.split(/\s+/).map(Number);
    if (!isNaN(vx) && !isNaN(vy)) {
      viewBoxOffsetX = -vx;
      viewBoxOffsetY = -vy;
      console.log('备用解析：应用viewBox偏移:', viewBoxOffsetX, viewBoxOffsetY);
    }
  }
  
  // 简化形状解析逻辑
  shapeElements.forEach((element, index) => {
    const shapeId = `shape:fallback-${index + 1}`;
    const tagName = element.tagName.toLowerCase();
    
    try {
      switch (tagName) {
        case 'rect': {
          const x = parseFloat(element.getAttribute('x') || '0') + viewBoxOffsetX;
          const y = parseFloat(element.getAttribute('y') || '0') + viewBoxOffsetY;
          const width = parseFloat(element.getAttribute('width') || '100');
          const height = parseFloat(element.getAttribute('height') || '100');
          
          shapes.push({
            id: shapeId,
            type: 'geo',
            x: x,
            y: y,
            w: width,
            h: height,
            geo: 'rectangle',
            color: 'black',
            fill: 'none',
            size: 'm',
            dash: 'draw'
          });
          break;
        }
        
        case 'circle': {
          const cx = parseFloat(element.getAttribute('cx') || '0') + viewBoxOffsetX;
          const cy = parseFloat(element.getAttribute('cy') || '0') + viewBoxOffsetY;
          const r = parseFloat(element.getAttribute('r') || '50');
          
          shapes.push({
            id: shapeId,
            type: 'geo',
            x: cx - r, // 转换为左上角坐标
            y: cy - r, // 转换为左上角坐标
            w: r * 2,
            h: r * 2,
            geo: 'ellipse',
            color: 'black',
            fill: 'none',
            size: 'm',
            dash: 'draw'
          });
          break;
        }
        
        case 'path': {
          const d = element.getAttribute('d') || '';
          if (d) {
            shapes.push({
              id: shapeId,
              type: 'path',
              x: viewBoxOffsetX,
              y: viewBoxOffsetY,
              d: d,
              color: 'black',
              fill: 'none',
              size: 'm',
              dash: 'draw'
            });
          }
          break;
        }
        
        case 'ellipse': {
          const cx = parseFloat(element.getAttribute('cx') || '0') + viewBoxOffsetX;
          const cy = parseFloat(element.getAttribute('cy') || '0') + viewBoxOffsetY;
          const rx = parseFloat(element.getAttribute('rx') || '50');
          const ry = parseFloat(element.getAttribute('ry') || '50');
          
          shapes.push({
            id: shapeId,
            type: 'geo',
            x: cx - rx, // 转换为左上角坐标
            y: cy - ry, // 转换为左上角坐标
            w: rx * 2,
            h: ry * 2,
            geo: 'ellipse',
            color: 'black',
            fill: 'none',
            size: 'm',
            dash: 'draw'
          });
          break;
        }
        
        case 'line': {
          const x1 = parseFloat(element.getAttribute('x1') || '0') + viewBoxOffsetX;
          const y1 = parseFloat(element.getAttribute('y1') || '0') + viewBoxOffsetY;
          const x2 = parseFloat(element.getAttribute('x2') || '100') + viewBoxOffsetX;
          const y2 = parseFloat(element.getAttribute('y2') || '100') + viewBoxOffsetY;
          
          // 将线段转换为draw类型的形状
          shapes.push({
            id: shapeId,
            type: 'draw',
            x: Math.min(x1, x2),
            y: Math.min(y1, y2),
            points: [
              { x: x1 - Math.min(x1, x2), y: y1 - Math.min(y1, y2), z: 0.5 },
              { x: x2 - Math.min(x1, x2), y: y2 - Math.min(y1, y2), z: 0.5 }
            ],
            color: 'black',
            size: 'm',
            dash: 'draw'
          });
          break;
        }
        
        case 'polyline':
        case 'polygon': {
          const points = element.getAttribute('points') || '';
          if (points) {
            // 解析点集
            const pointPairs = points.trim().split(/\s+/);
            const parsedPoints = [];
            
            for (let i = 0; i < pointPairs.length; i += 2) {
              if (i + 1 < pointPairs.length) {
                const x = parseFloat(pointPairs[i]) + viewBoxOffsetX;
                const y = parseFloat(pointPairs[i + 1]) + viewBoxOffsetY;
                parsedPoints.push({ x, y });
              }
            }
            
            if (parsedPoints.length > 0) {
              // 计算边界框
              const minX = Math.min(...parsedPoints.map(p => p.x));
              const minY = Math.min(...parsedPoints.map(p => p.y));
              const maxX = Math.max(...parsedPoints.map(p => p.x));
              const maxY = Math.max(...parsedPoints.map(p => p.y));
              
              // 调整点坐标为相对于形状左上角的坐标
              const relativePoints = parsedPoints.map(p => ({
                x: p.x - minX,
                y: p.y - minY,
                z: 0.5
              }));
              
              shapes.push({
                id: shapeId,
                type: 'draw',
                x: minX,
                y: minY,
                points: relativePoints,
                color: 'black',
                size: 'm',
                dash: 'draw',
                isComplete: tagName === 'polygon' // 对于polygon，闭合路径
              });
            }
          }
          break;
        }
        
        case 'text': {
          const x = parseFloat(element.getAttribute('x') || '0') + viewBoxOffsetX;
          const y = parseFloat(element.getAttribute('y') || '0') + viewBoxOffsetY;
          const textContent = element.textContent || '';
          
          if (textContent.trim()) {
            shapes.push({
              id: shapeId,
              type: 'text',
              x: x,
              y: y,
              w: 200, // 默认宽度
              h: 100, // 默认高度
              text: textContent,
              font: 'draw',
              align: 'middle',
              verticalAlign: 'middle',
              color: 'black',
              size: 'm'
            });
          }
          break;
        }
        
        // 可以添加更多基本形状的处理...
      }
    } catch (error) {
      console.warn('备用解析：处理形状元素失败:', tagName, error);
    }
  });
  
  console.log('备用解析完成，成功解析', shapes.length, '个形状');
  return { shapes, imageData };
}

export { parseSvgToShapes, parseSvgToShapesFallback };