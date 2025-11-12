import { Editor, TLShape, TLShapeId, createShapeId } from 'tldraw';
import { DOMParser } from 'xmldom';
import { reverseSvgPathToSegments, sanitizeSvgPath, TLDrawPoint } from './reverseSvgPathToSegments';

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
 * tldraw 颜色名称到 SVG Hex 值的映射 (基于 tldraw 官方颜色定义)
 */
const TL_COLOR_TO_HEX_MAP: Record<string, string> = {
  // 黑色系
  'black': '#1d1d1d',
  // 灰色系
  'grey': '#808080',
  // 紫色系
  'light-violet': '#c084fc',
  'violet': '#a855f7',
  // 蓝色系
  'blue': '#3b82f6',
  'light-blue': '#60a5fa',
  // 黄色和橙色系
  'yellow': '#fbbf24',
  'orange': '#f97316',
  // 绿色系
  'green': '#10b981',
  'light-green': '#34d399',
  // 红色系
  'light-red': '#f87171',
  'red': '#ef4444',
  // 白色系
  'white': '#ffffff'
};

/**
 * tldraw 粗细名称到 SVG stroke-width 值的映射 (近似值)
 */
const TL_SIZE_TO_STROKE_WIDTH_MAP: Record<string, number> = {
  s: 1, // Small
  m: 3, // Medium
  l: 5, // Large
  xl: 7, // Extra Large
};

/**
 * tldraw 虚线名称到 SVG stroke-dasharray 值的映射 (近似值)
 */
const TL_DASH_TO_DASHARRAY_MAP: Record<string, string | null> = {
  draw: null, //手绘 无 dasharray
  dashed: '10, 5', //虚线 示例值，实际值可能更复杂
  dotted: '3, 3', //虚点 示例值，实际值可能更复杂
  solid: null, //实心 无 dasharray
};

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
function getTldrawColorFromSvg(svgColor: string | null): string {
  if (!svgColor || svgColor === 'none' || svgColor === 'transparent') {
    return 'black'; // 默认颜色
  }

  // tldraw支持的颜色名称列表（来自@tldraw/tlschema）
  const tldrawColors = [
    'black', 'grey', 'light-violet', 'violet', 'blue', 'light-blue', 
    'yellow', 'orange', 'green', 'light-green', 'light-red', 'red', 'white'
  ];
  
  // 从DefaultColorThemePalette生成颜色映射表
  const colorMap = generateColorMapFromPalette();

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
  if (colorMap[hexColor]) {
    return colorMap[hexColor];
  }
  
  // 4. 对于不在映射表中的颜色，尝试近似匹配
  const matchedColor = findClosestColor(hexColor, colorMap);
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
 * 查找最接近的 tldraw size 名称
 */
function getTldrawSizeFromSvg(strokeWidth: number): string {
  if (isNaN(strokeWidth) || strokeWidth <= 0) {
    return 'm';
  }

  let bestMatch = 'm';
  let minDiff = Infinity;

  for (const [tlSize, tlWidth] of Object.entries(TL_SIZE_TO_STROKE_WIDTH_MAP)) {
    const diff = Math.abs(strokeWidth - tlWidth);
    if (diff < minDiff) {
      minDiff = diff;
      bestMatch = tlSize;
    }
  }

  return bestMatch;
}

/**
 * 查找最接近的 tldraw dash 名称
 */
function getTldrawDashFromSvg(dashArray: string | null): string {
  if (!dashArray) {
    return 'draw'; // 默认手绘或实线
  }

  const normalizedDash = dashArray.replace(/[\s,]/g, '').trim();

  // 检查是否与已知的虚线模式匹配
  for (const [tlDash, tlDashArray] of Object.entries(TL_DASH_TO_DASHARRAY_MAP)) {
    if (tlDashArray && tlDashArray.replace(/[\s,]/g, '').trim() === normalizedDash) {
      return tlDash;
    }
  }

  // 无法精确匹配时，如果有 dashArray，则认为是 dashed
  if (normalizedDash.length > 0) {
    return 'dashed';
  }

  return 'draw';
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
 * 解析SVG变换字符串，提取x和y坐标
 * @param transformString SVG变换字符串，如"matrix(1, 0, 0, 1, 10, 20)"
 * @returns 包含x和y坐标的对象
 */
function parseTransform(transform?: string) {
  if (!transform) return { x: 0, y: 0, matrix: [1, 0, 0, 1, 0, 0] }
  
  // 处理matrix变换
  const match = transform.match(/matrix\(([^)]+)\)/)
  if (match) {
    const [a, b, c, d, e, f] = match[1].split(/[,\s]+/).map(Number)
    return { x: e || 0, y: f || 0, matrix: [a || 1, b || 0, c || 0, d || 1, e || 0, f || 0] }
  }
  
  // 处理translate变换
  const translateMatch = transform.match(/translate\(([^)]+)\)/)
  if (translateMatch) {
    const [x, y] = translateMatch[1].split(/[,\s]+/).map(Number)
    return { x: x || 0, y: y || 0, matrix: [1, 0, 0, 1, x || 0, y || 0] }
  }
  
  return { x: 0, y: 0, matrix: [1, 0, 0, 1, 0, 0] }
}
/**
   * 合并两个变换矩阵
   * @param matrix1 第一个变换矩阵 [a1, b1, c1, d1, e1, f1]
   * @param matrix2 第二个变换矩阵 [a2, b2, c2, d2, e2, f2]
   * @returns 合并后的变换矩阵
   */
  function combineTransformMatrices(matrix1: number[], matrix2: number[]): number[] {
    // 矩阵乘法: result = matrix2 * matrix1
    // [a2, b2, 0] [a1, b1, 0] [a2*a1 + b2*c1, a2*b1 + b2*d1, 0]
    // [c2, d2, 0] * [c1, d1, 0] = [c2*a1 + d2*c1, c2*b1 + d2*d1, 0]
    // [e2, f2, 1] [e1, f1, 1] [e2 + f2*c1 + a2*e1, f2 + e2*c1 + b2*f1, 1]
    
    const [a1, b1, c1, d1, e1, f1] = matrix1;
    const [a2, b2, c2, d2, e2, f2] = matrix2;
    
    return [
      a2 * a1 + b2 * c1,
      a2 * b1 + b2 * d1,
      c2 * a1 + d2 * c1,
      c2 * b1 + d2 * d1,
      e2 + a2 * e1 + b2 * f1,
      f2 + c2 * e1 + d2 * f1
    ];
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

/**
 * 解析SVG文件并转换为tldraw形状数据
 * @param svgString SVG文件内容
 * @returns 解析后的形状数据数组和提取的所有图片数据
 */
export function parseSvgToShapes(svgString: string): { shapes: SvgShapeData[], imageData: Record<string, { base64Data: string, width: number, height: number, x: number, y: number }> } {
  try {
    console.log('Starting SVG parsing...');
    
    // 首先修复SVG文件，为image类型添加实际图片数据
    const { fixedSvg, imageData }: { fixedSvg: string, imageData: Record<string, { base64Data: string, width: number, height: number, x: number, y: number }> } = fixSvgImageData(svgString);
    
    // 改进的SVG清理逻辑：对于大型文件，避免过度清理
    let cleanedSvgString = fixedSvg;
    
    // 检查文件大小，对于大型文件采用更保守的清理策略
    const isLargeFile = svgString.length > 100000; // 超过100KB视为大型文件
    
    if (!isLargeFile) {
      // 对于小型文件，正常清理XML声明和DOCTYPE
      cleanedSvgString = fixedSvg
        .replace(/<\?xml[^>]*\?>/gi, '')
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .trim();
      
      if (!cleanedSvgString.trim()) {
        cleanedSvgString = fixedSvg;
      }
    } else {
      // 对于大型文件，只移除XML声明，保留DOCTYPE以避免解析问题
      console.log('检测到大型SVG文件，采用保守清理策略');
      cleanedSvgString = fixedSvg
        .replace(/<\?xml[^>]*\?>/gi, '')
        .trim();
    }
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanedSvgString, 'image/svg+xml');
    
    const parseError = doc.getElementsByTagName('parsererror');
    if (parseError.length > 0) {
      const errorText = parseError[0].textContent || 'Unknown XML parsing error';
      console.warn('Failed to parse SVG as XML:', errorText);
      
      // 提供更详细的错误信息，特别是对于大型文件
      if (isLargeFile) {
        console.warn('大型SVG文件解析失败，尝试备用解析策略...');
        
        // 尝试备用解析策略：使用更宽松的解析方式
        try {
          // 尝试直接解析原始SVG内容，不进行清理
          const fallbackDoc = parser.parseFromString(fixedSvg, 'image/svg+xml');
          const fallbackParseError = fallbackDoc.getElementsByTagName('parsererror');
          
          if (fallbackParseError.length === 0) {
            console.log('备用解析策略成功，使用原始SVG内容');
            return parseSvgToShapesFallback(fallbackDoc, imageData, svgString.length);
          }
        } catch (fallbackError) {
          console.warn('备用解析策略也失败:', fallbackError);
        }
      }
      
      return { shapes: [], imageData: {} };
    }
    
    const svgElement = doc.documentElement;
    if (!svgElement || svgElement.tagName !== 'svg') {
      console.warn('Invalid SVG file - root element is not SVG');
      
      // 对于大型文件，提供更详细的诊断信息
      if (isLargeFile) {
        console.warn('大型SVG文件根元素检查失败，文件大小:', svgString.length, '字符');
        console.warn('文件前500字符预览:', svgString.substring(0, 500));
      }
      
      return { shapes: [], imageData: {} };
    }
    // ✅ 修复 viewBox 偏移问题：调整 SVG 原点坐标
    // 首先确保全局变量被正确初始化为默认值
    (globalThis as any).__svgViewBoxOffset__ = { x: 0, y: 0 };
    // 对于常规SVG，保持transform矩阵的相对位置关系
    // (globalThis as any).__disableAutoCenterForRegularSvg__ = true;
    
    const viewBox = svgElement.getAttribute('viewBox');
    if (viewBox) {
      const [vx, vy] = viewBox.split(/\s+/).map(Number);
      if (!isNaN(vx) && !isNaN(vy)) {
        console.log(`Detected viewBox offset: (${vx}, ${vy})`);
        // ✅ 修复：viewBox偏移量应该是负值，用于补偿SVG坐标系偏移
        (globalThis as any).__svgViewBoxOffset__ = { x: -vx, y: -vy };
        console.log(`设置viewBox全局偏移: (${-vx}, ${-vy})`);
      }
    } else {
      console.log('未检测到viewBox属性，使用默认偏移量: (0, 0)');
    }

    const shapes: SvgShapeData[] = [];
    
    // 首先检查是否有metadata，如果有则优先使用metadata中的形状定义
    const metadataElement = svgElement.getElementsByTagName('metadata')[0];
    let hasMetadataShapes = false;
    console.log('检查metadata元素:', metadataElement ? '存在' : '不存在');
    
    if (metadataElement) {
      const tldrawElement = metadataElement.getElementsByTagName('tldraw')[0];
      if (tldrawElement) {
        try {
          const tldrawData = JSON.parse(tldrawElement.textContent || '{}');
          if (tldrawData.document && tldrawData.document.store) {
            const store = tldrawData.document.store;
            
            // 首先提取asset资源信息
            const assetMap = new Map<string, any>();
            for (const key in store) {
              if (key.startsWith('asset:')) {
                const assetInfo = store[key];
                assetMap.set(assetInfo.id, assetInfo);
              }
            }
            
            // 然后提取shape信息，保持正确的图层顺序
            const shapeKeys = Object.keys(store).filter(key => key.startsWith('shape:'));
            
            // 按照键名中的数字部分排序，确保图层顺序正确
            shapeKeys.sort((a, b) => {
              // 提取shape:后面的数字部分进行比较
              const numA = parseInt(a.replace('shape:', ''));
              const numB = parseInt(b.replace('shape:', ''));
              return numA - numB;
            });
            
            // 按照排序后的顺序处理形状
            shapeKeys.forEach(key => {
              const shapeInfo = store[key];
              const shape: SvgShapeData = {
                id: shapeInfo.id,
                type: shapeInfo.type,
                x: shapeInfo.x || 0,
                y: shapeInfo.y || 0,
                rotation: shapeInfo.rotation || 0,
                opacity: shapeInfo.opacity !== undefined && shapeInfo.opacity !== null ? shapeInfo.opacity : 1, // 修复：确保opacity正确使用
              };
              
              // 处理不同类型的属性
              if (shapeInfo.props) {
                Object.assign(shape, shapeInfo.props);
                
                // 特殊处理draw类型的segments
                if (shapeInfo.type === 'draw' && shapeInfo.props.segments) {
                  shape.segments = shapeInfo.props.segments;
                  shape.isComplete = shapeInfo.props.isComplete !== undefined ? shapeInfo.props.isComplete : true;
                  shape.isPen = shapeInfo.props.isPen !== undefined ? shapeInfo.props.isPen : false;
                }
                
                // 特殊处理geo类型的属性
                if (shapeInfo.type === 'geo') {
                  shape.geo = shapeInfo.props.geo || 'rectangle';
                  shape.w = shapeInfo.props.w || 100;
                  shape.h = shapeInfo.props.h || 100;
                }
                
                // 特殊处理image类型的属性
                if (shapeInfo.type === 'image') {
                  shape.assetId = shapeInfo.props.assetId || undefined;
                  shape.w = shapeInfo.props.w || 100;
                  shape.h = shapeInfo.props.h || 100;
                  
                  // 如果assetId存在，尝试从assetMap中获取asset信息
                  if (shape.assetId && assetMap.has(shape.assetId)) {
                    const assetInfo = assetMap.get(shape.assetId);
                    shape.assetInfo = assetInfo;
                  }
                  
                  // 修复：即使没有assetInfo，也要确保assetId存在
                  if (!shape.assetId) {
                    // 如果没有assetId，生成一个基于形状ID的assetId
                    shape.assetId = `asset:${shape.id.replace('shape:', '')}`;
                    console.log(`为image形状生成assetId: ${shape.assetId}`);
                  }
                }
              }
              
              shapes.push(shape);
              hasMetadataShapes = true;
              console.log(`从metadata中解析到形状: ${shape.id}, 类型: ${shape.type}, 设置hasMetadataShapes=true`);
            });
          }
        } catch (e) {
          console.warn('Failed to parse tldraw metadata:', e);
        }
      }
    }
    
    // 递归解析SVG元素
      const parseElement = (element: Element, parentTransform?: string, parentOpacity: number = 1): void => {
        const tagName = element.tagName.toLowerCase();
        const transform = element.getAttribute('transform') || parentTransform;
        
        // 计算当前元素的opacity：自身opacity × 父元素opacity
        const elementOpacityAttr = element.getAttribute('opacity');
        const elementOpacityValue = elementOpacityAttr ? parseFloat(elementOpacityAttr) : 1;
        const currentOpacity = parentOpacity * elementOpacityValue;
        
        console.log(`解析元素 ${tagName}: 自身opacity=${elementOpacityValue}, 父opacity=${parentOpacity}, 最终opacity=${currentOpacity}`);
        
        // 如果已经有metadata中的形状定义，跳过对应的SVG元素解析
        if (hasMetadataShapes && tagName !== 'metadata') {
          console.log(`跳过元素 ${tagName}，因为hasMetadataShapes=${hasMetadataShapes}`);
          // 对于有metadata的情况，只处理metadata元素本身，跳过其他SVG元素
          // 这样可以避免重复创建形状
          if (tagName === 'g') {
            // 对于组元素，仍然需要递归处理子元素，但跳过形状创建
            const childNodes = element.childNodes || [];
            for (let i = 0; i < childNodes.length; i++) {
              const child = childNodes[i];
              if (child.nodeType === 1) {
                parseElement(child as Element, transform, currentOpacity); // 修复：传递当前opacity值
              }
            }
          }
          return;
        }
        
        // 检查是否是ink生成的tldraw形状 (优先处理)
        // 只有当元素明确标记为tldraw形状时才优先处理
        const isTldrawShape = element.getAttribute('data-tldraw') === 'true' || 
                              element.getAttribute('data-type') ||
                              element.tagName.toLowerCase() === 'metadata'; // 处理ink插件的metadata
        
        console.log(`解析元素 ${tagName}: isTldrawShape=${isTldrawShape}, hasMetadataShapes=${hasMetadataShapes}`);
        
        if (isTldrawShape) {
          // 特殊处理ink插件的metadata
          if (tagName === 'metadata') {
            // metadata已经在函数开始时处理过了，这里直接返回
            return;
          }
        
          // 处理其他tldraw形状 (保持原有逻辑)
        const shapeType = element.getAttribute('data-type') || 'draw';
        const shapeId = element.getAttribute('id') || createShapeId();
        
        const shape: SvgShapeData = {
          id: shapeId,
          type: shapeType as any,
          transform: transform,
          x: 0, // 简化处理，假设 tldraw 导出时已处理坐标
          y: 0,
        };
        
        // ... (保持原有 tldraw 形状属性解析逻辑)
        switch (shapeType) {
          case 'draw':
            const segmentsAttr = element.getAttribute('data-segments');
            if (segmentsAttr) {
              try {
                shape.segments = JSON.parse(segmentsAttr);
              } catch (e) {
                console.warn('Failed to parse segments:', e);
              }
            }
            shape.isComplete = element.getAttribute('data-isComplete') === 'true';
            shape.isPen = element.getAttribute('data-isPen') === 'true';
            break;
            
          case 'geo':
            shape.geo = element.getAttribute('data-geo') || 'rectangle';
            shape.w = parseFloat(element.getAttribute('data-w') || '100');
            shape.h = parseFloat(element.getAttribute('data-h') || '100');
            break;
            
          case 'image':
            shape.assetId = element.getAttribute('data-assetId') || undefined;
            shape.w = parseFloat(element.getAttribute('data-w') || '100');
            shape.h = parseFloat(element.getAttribute('data-h') || '100');
            break;
        }
        
        // 设置通用属性
        shape.color = element.getAttribute('data-color') || 'black';
        shape.fill = element.getAttribute('data-fill') || 'none';
        shape.size = element.getAttribute('data-size') || 'm';
        shape.dash = element.getAttribute('data-dash') || 'draw';
        shape.scale = parseFloat(element.getAttribute('data-scale') || '1');
        // ... 其他属性
        
        shapes.push(shape);
        return;
      }
      
      // 处理常规SVG元素 ---
      const shapeId = createShapeId();
      // 修复：使用新的函数获取样式和opacity，确保opacity作为顶级属性设置
      const { styles, opacity: shapeOpacity } = getTldrawStyleAndOpacity(element, transform, currentOpacity);

      switch (tagName) {
        case 'g':
          // 修复：组元素不应该创建形状，只负责传递transform和opacity给子元素
          // 直接递归处理子元素，不创建任何形状
          console.log(`处理g元素: ${shapeId}，传递transform给子元素，不创建形状`);
          
          // 获取当前元素的transform
          const currentTransform = element.getAttribute('transform');
          let combinedTransform = parentTransform;
          
          // 如果当前元素有transform，需要与父级transform合并
          if (currentTransform) {
            if (parentTransform) {
              // 合并父级和当前元素的transform
              const parentMatrix = parseTransform(parentTransform).matrix;
              const currentMatrix = parseTransform(currentTransform).matrix;
              const combinedMatrix = combineTransformMatrices(parentMatrix, currentMatrix);
              
              // 生成合并后的transform字符串
              combinedTransform = `matrix(${combinedMatrix.join(', ')})`;
              console.log(`合并transform矩阵: 父级=${parentTransform}, 当前=${currentTransform}, 合并后=${combinedTransform}`);
            } else {
              // 如果没有父级transform，直接使用当前transform
              combinedTransform = currentTransform;
              console.log(`使用当前元素的transform: ${currentTransform}`);
            }
          }
          
          // 递归处理所有子元素，传递合并后的transform和opacity
          const childNodes = element.childNodes || [];
          for (let i = 0; i < childNodes.length; i++) {
            const child = childNodes[i];
            if (child.nodeType === 1) {
              parseElement(child as Element, combinedTransform, currentOpacity);
            }
          }
          break;
          
        case 'rect': {
          // 转换为 tldraw 'geo' 形状 (rectangle)
          const x = parseFloat(element.getAttribute('x') || '0');
          const y = parseFloat(element.getAttribute('y') || '0');
          const w = parseFloat(element.getAttribute('width') || '0');
          const h = parseFloat(element.getAttribute('height') || '0');
          
          if (w > 0 && h > 0) {
            // 计算最终位置：考虑transform变换
            let finalX = x;
            let finalY = y;
            
            if (transform) {
              // 如果有transform，解析变换矩阵并应用到位置
              const transformCoords = parseTransform(transform);
              finalX += transformCoords.x;
              finalY += transformCoords.y;
              console.log(`应用transform到rect: 原始位置(${x}, ${y}), 变换(${transformCoords.x}, ${transformCoords.y}), 最终位置(${finalX}, ${finalY})`);
            }
            
            // 应用 viewBox 全局偏移
            const viewOffset = (globalThis as any).__svgViewBoxOffset__ || { x: 0, y: 0 };
            finalX -= viewOffset.x;
            finalY -= viewOffset.y;
            console.log(`应用viewBox偏移到rect: 偏移(${viewOffset.x}, ${viewOffset.y}), 最终位置(${finalX}, ${finalY})`);
            
            shapes.push({
              id: shapeId,
              type: 'geo',
              x: finalX,
              y: finalY,
              w: w,
              h: h,
              geo: 'rectangle',
              opacity: shapeOpacity, // 修复：单独设置顶级opacity属性
              ...styles,
            });
          }
          break;
        }
          
        case 'circle': {
          // 转换为 tldraw 'geo' 形状 (ellipse)
          const cx = parseFloat(element.getAttribute('cx') || '0');
          const cy = parseFloat(element.getAttribute('cy') || '0');
          const r = parseFloat(element.getAttribute('r') || '0');
          
          if (r > 0) {
            // 计算最终位置：考虑transform变换
            let finalCx = cx;
            let finalCy = cy;
            
            if (transform) {
              // 如果有transform，解析变换矩阵并应用到位置
              const transformCoords = parseTransform(transform);
              finalCx += transformCoords.x;
              finalCy += transformCoords.y;
              console.log(`应用transform到circle: 原始位置(${cx}, ${cy}), 变换(${transformCoords.x}, ${transformCoords.y}), 最终位置(${finalCx}, ${finalCy})`);
            }
            
            // 应用 viewBox 全局偏移
            const viewOffset = (globalThis as any).__svgViewBoxOffset__ || { x: 0, y: 0 };
            finalCx -= viewOffset.x;
            finalCy -= viewOffset.y;
            console.log(`应用viewBox偏移到circle: 偏移(${viewOffset.x}, ${viewOffset.y}), 最终位置(${finalCx}, ${finalCy})`);
            
            shapes.push({
              id: shapeId,
              type: 'geo',
              x: finalCx - r,
              y: finalCy - r,
              w: r * 2,
              h: r * 2,
              geo: 'ellipse',
              opacity: shapeOpacity, // 修复：单独设置顶级opacity属性
              ...styles,
            });
          }
          break;
        }
          
        case 'ellipse': {
          // 转换为 tldraw 'geo' 形状 (ellipse)
          const ecx = parseFloat(element.getAttribute('cx') || '0');
          const ecy = parseFloat(element.getAttribute('cy') || '0');
          const rx = parseFloat(element.getAttribute('rx') || '0');
          const ry = parseFloat(element.getAttribute('ry') || '0');
          
          if (rx > 0 && ry > 0) {
            // 计算最终位置：考虑transform变换
            let finalEcx = ecx;
            let finalEcy = ecy;
            
            if (transform) {
              // 如果有transform，解析变换矩阵并应用到位置
              const transformCoords = parseTransform(transform);
              finalEcx += transformCoords.x;
              finalEcy += transformCoords.y;
              console.log(`应用transform到ellipse: 原始位置(${ecx}, ${ecy}), 变换(${transformCoords.x}, ${transformCoords.y}), 最终位置(${finalEcx}, ${finalEcy})`);
            }
            
            // 应用 viewBox 全局偏移
            const viewOffset = (globalThis as any).__svgViewBoxOffset__ || { x: 0, y: 0 };
            finalEcx -= viewOffset.x;
            finalEcy -= viewOffset.y;
            console.log(`应用viewBox偏移到ellipse: 偏移(${viewOffset.x}, ${viewOffset.y}), 最终位置(${finalEcx}, ${finalEcy})`);
            
            shapes.push({
              id: shapeId,
              type: 'geo',
              x: finalEcx - rx,
              y: finalEcy - ry,
              w: rx * 2,
              h: ry * 2,
              geo: 'ellipse',
              opacity: shapeOpacity, // 修复：单独设置顶级opacity属性
              ...styles,
            });
          }
          break;
        }
          
        case 'line': {
          // 将line元素转换为path数据
          const x1 = parseFloat(element.getAttribute('x1') || '0');
          const y1 = parseFloat(element.getAttribute('y1') || '0');
          const x2 = parseFloat(element.getAttribute('x2') || '0');
          const y2 = parseFloat(element.getAttribute('y2') || '0');
          
          const d = `M ${x1} ${y1} L ${x2} ${y2}`;
          
          // 计算最终位置：考虑transform变换
          let x = 0;
          let y = 0;
          
          if (transform) {
            // 如果有transform，解析变换矩阵并应用到位置
            const transformCoords = parseTransform(transform);
            x = transformCoords.x;
            y = transformCoords.y;
            console.log(`应用transform到line: 变换(${transformCoords.x}, ${transformCoords.y}), 最终位置(${x}, ${y})`);
          }
          
          // 应用 viewBox 全局偏移
          const viewOffset = (globalThis as any).__svgViewBoxOffset__ || { x: 0, y: 0 };
          x -= viewOffset.x;
          y -= viewOffset.y;
          console.log(`应用viewBox偏移到line: 偏移(${viewOffset.x}, ${viewOffset.y}), 最终位置(${x}, ${y})`);
          
          shapes.push({
            id: shapeId,
            type: 'path',
            d: d,
            x: x,
            y: y,
            transform: transform,
            opacity: shapeOpacity, // 修复：单独设置顶级opacity属性
            ...styles,
          });
          break;
        }
          
        case 'polyline': {
          // 将polyline元素转换为path数据
          const points = element.getAttribute('points') || '';
          const pointsArray = points.trim().split(/[\s,]+/).filter(p => p.trim() !== '');
          
          if (pointsArray.length >= 2) {
            let d = `M ${pointsArray[0]} ${pointsArray[1]}`;
            for (let i = 2; i < pointsArray.length; i += 2) {
              if (i + 1 < pointsArray.length) {
                d += ` L ${pointsArray[i]} ${pointsArray[i + 1]}`;
              }
            }
            
            // 计算最终位置：考虑transform变换
            let x = 0;
            let y = 0;
            
            if (transform) {
              // 如果有transform，解析变换矩阵并应用到位置
              const transformCoords = parseTransform(transform);
              x = transformCoords.x;
              y = transformCoords.y;
              console.log(`应用transform到polyline: 变换(${transformCoords.x}, ${transformCoords.y}), 最终位置(${x}, ${y})`);
            }
            
            // 应用 viewBox 全局偏移
            const viewOffset = (globalThis as any).__svgViewBoxOffset__ || { x: 0, y: 0 };
            x -= viewOffset.x;
            y -= viewOffset.y;
            console.log(`应用viewBox偏移到polyline: 偏移(${viewOffset.x}, ${viewOffset.y}), 最终位置(${x}, ${y})`);
            
            shapes.push({
              id: shapeId,
              type: 'path',
              d: d,
              x: x,
              y: y,
              transform: transform,
              opacity: shapeOpacity, // 修复：单独设置顶级opacity属性
              ...styles,
            });
          }
          break;
        }
          
        case 'polygon': {
          // 将polygon元素转换为path数据（闭合路径）
          const points = element.getAttribute('points') || '';
          const pointsArray = points.trim().split(/[\s,]+/).filter(p => p.trim() !== '');
          
          if (pointsArray.length >= 2) {
            let d = `M ${pointsArray[0]} ${pointsArray[1]}`;
            for (let i = 2; i < pointsArray.length; i += 2) {
              if (i + 1 < pointsArray.length) {
                d += ` L ${pointsArray[i]} ${pointsArray[i + 1]}`;
              }
            }
            d += ' Z'; // 闭合路径
            
            // 计算最终位置：考虑transform变换
            let x = 0;
            let y = 0;
            
            if (transform) {
              // 如果有transform，解析变换矩阵并应用到位置
              const transformCoords = parseTransform(transform);
              x = transformCoords.x;
              y = transformCoords.y;
              console.log(`应用transform到polygon: 变换(${transformCoords.x}, ${transformCoords.y}), 最终位置(${x}, ${y})`);
            }
            
            // 应用 viewBox 全局偏移
            const viewOffset = (globalThis as any).__svgViewBoxOffset__ || { x: 0, y: 0 };
            x -= viewOffset.x;
            y -= viewOffset.y;
            console.log(`应用viewBox偏移到polygon: 偏移(${viewOffset.x}, ${viewOffset.y}), 最终位置(${x}, ${y})`);
            
            shapes.push({
              id: shapeId,
              type: 'path',
              d: d,
              x: x,
              y: y,
              transform: transform,
              opacity: shapeOpacity, // 修复：单独设置顶级opacity属性
              ...styles,
            });
          }
          break;
        }
          
        case 'path': {
          const d = element.getAttribute('d');
          if (!d) break;

          // 获取样式属性
          const { styles, opacity: shapeOpacity } = getTldrawStyleAndOpacity(element, parentTransform, parentOpacity);
          
          // 获取变换矩阵
          let transform = element.getAttribute('transform') || parentTransform;
          
          // 特殊处理网络下载的SVG：检测并处理包含scale(-0.1)的变换
          if (transform && transform.includes('scale') && transform.includes('-0.1')) {
            console.log('检测到网络下载SVG的scale(-0.1)变换，进行特殊处理');
            
            // 解析变换矩阵
            const transformData = parseTransform(transform);
            const [a, b, c, dValue, e, f] = transformData.matrix;
            
            // 检查是否是负缩放（如scale(0.1,-0.1)）
            if (dValue < 0) {
              console.log('检测到Y轴负缩放，调整坐标系统');
              
              // 对于负缩放，我们需要先对路径数据进行预处理
              // 主要是反转Y坐标，以抵消负缩放的影响
              let processedD = d;
              
              // 简单的Y坐标反转：将所有Y坐标值取反
              // 这里我们使用正则表达式匹配路径中的数字
              processedD = processedD.replace(/([MLHVCSQTAZ])\s*([^MLHVCSQTAZ]*)/gi, (match, cmd, params) => {
                // 处理命令参数，反转Y坐标
                const processedParams = params.replace(/(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g, (coordMatch: string, x: string, y: string) => {
                  const numY = parseFloat(y);
                  if (!isNaN(numY)) {
                    return `${x} ${-numY}`;
                  }
                  return coordMatch;
                });
                return cmd + processedParams;
              });
              
              // 修正变换矩阵，移除负缩放
              const correctedTransform = transform.replace(/scale\([^)]*\)/g, 'scale(0.1, 0.1)');
              transform = correctedTransform;
              
              console.log('修正后的路径数据和变换');
            }
          }

          const simplifiedD = sanitizeSvgPath(d);
          const hasValidPathCommands = /[MLCQAZ]/.test(simplifiedD);
          const hasValidCoordinates = /[\d\-\.]/.test(simplifiedD);
          if (!hasValidPathCommands || !hasValidCoordinates) break;

          // 计算边界框，用于定位
          const segments = reverseSvgPathToSegments(simplifiedD, { bezierSegments: 32, arcSegments: 48 });
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          
          // 如果有transform，需要先应用变换到所有点，再计算边界框
          const transformMatrix = transform ? parseTransform(transform).matrix : [1, 0, 0, 1, 0, 0];
          
          for (const seg of segments) {
            for (const p of seg.points) {
              // 应用变换矩阵到每个点
              let transformedX = p.x;
              let transformedY = p.y;
              
              if (transform) {
                const [a, b, c, d, e, f] = transformMatrix;
                transformedX = a * p.x + c * p.y + e;
                transformedY = b * p.x + d * p.y + f;
              }
              
              minX = Math.min(minX, transformedX);
              minY = Math.min(minY, transformedY);
              maxX = Math.max(maxX, transformedX);
              maxY = Math.max(maxY, transformedY);
            }
          }

          // ✅ 修复：使用变换后的中心点坐标
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          
          // 对于path元素，我们不需要再额外应用transform，因为已经应用到所有点了
          // 只需要应用viewBox偏移（如果需要）
          let finalX = cx;
          let finalY = cy;
          
          // 应用 viewBox 全局偏移（仅在需要自动居中时应用）
          const viewOffset = (globalThis as any).__svgViewBoxOffset__ || { x: 0, y: 0 };
          // 对于常规SVG，当禁用自动居中时，不应用viewBox偏移，保持原始transform相对位置
          const shouldApplyViewOffset = !(globalThis as any).__disableAutoCenterForRegularSvg__;
          if (shouldApplyViewOffset) {
            finalX -= viewOffset.x;
            finalY -= viewOffset.y;
            console.log(`应用viewBox偏移到path: 偏移(${viewOffset.x}, ${viewOffset.y}), 最终位置(${finalX}, ${finalY})`);
          } else {
            console.log(`跳过viewBox偏移到path: 禁用自动居中，保持原始transform相对位置，最终位置(${finalX}, ${finalY})`);
          }

          shapes.push({
            id: shapeId,
            type: 'path',
            d: simplifiedD,
            x: finalX,
            y: finalY,
            transform,
            opacity: shapeOpacity,
            ...styles,
          });
          break;
        }
        
        case 'image': {
          // 处理SVG image元素，转换为tldraw image类型
          const x = parseFloat(element.getAttribute('x') || '0');
          const y = parseFloat(element.getAttribute('y') || '0');
          const width = parseFloat(element.getAttribute('width') || '0');
          const height = parseFloat(element.getAttribute('height') || '0');
          const href = element.getAttribute('xlink:href') || element.getAttribute('href');
          
          if (width > 0 && height > 0 && href) {
            // 计算最终位置：考虑transform变换
            let finalX = x;
            let finalY = y;
            
            if (transform) {
              // 如果有transform，解析变换矩阵并应用到位置
              const transformCoords = parseTransform(transform);
              finalX += transformCoords.x;
              finalY += transformCoords.y;
              console.log(`应用transform到图片: 原始位置(${x}, ${y}), 变换(${transformCoords.x}, ${transformCoords.y}), 最终位置(${finalX}, ${finalY})`);
            }
            
            // 应用 viewBox 全局偏移
            const viewOffset = (globalThis as any).__svgViewBoxOffset__ || { x: 0, y: 0 };
            finalX -= viewOffset.x;
            finalY -= viewOffset.y;
            console.log(`应用viewBox偏移到图片: 偏移(${viewOffset.x}, ${viewOffset.y}), 最终位置(${finalX}, ${finalY})`);
            
            // 创建image类型形状，确保assetId以"asset:"开头
            const assetId = href.startsWith('asset:') ? href : `asset:${href}`;
            
            // 创建image类型形状
            shapes.push({
              id: shapeId,
              type: 'image',
              x: finalX,
              y: finalY,
              w: width,
              h: height,
              assetId: assetId,
              opacity: shapeOpacity, // 修复：单独设置顶级opacity属性
              ...styles,
            });
          }
          break;
        }
        
        case 'text': {
          // 处理SVG text元素，转换为tldraw text类型
          const x = parseFloat(element.getAttribute('x') || '0');
          const y = parseFloat(element.getAttribute('y') || '0');
          const textContent = element.textContent || '';
          
          if (textContent.trim()) {
            // 应用 viewBox 全局偏移
            const viewOffset = (globalThis as any).__svgViewBoxOffset__ || { x: 0, y: 0 };
            const finalX = x - viewOffset.x;
            const finalY = y - viewOffset.y;
            console.log(`应用viewBox偏移到text: 偏移(${viewOffset.x}, ${viewOffset.y}), 最终位置(${finalX}, ${finalY})`);
            
            // 创建text类型形状
            shapes.push({
              id: shapeId,
              type: 'text',
              x: finalX,
              y: finalY,
              w: 200, // 默认宽度
              h: 100, // 默认高度
              text: textContent,
              font: 'draw',
              align: 'middle',
              verticalAlign: 'middle',
              opacity: shapeOpacity, // 修复：单独设置顶级opacity属性
              ...styles,
            });
          }
          break;
        }
          
        default:
          // 递归处理其他元素
          const defaultChildNodes = element.childNodes || [];
          for (let i = 0; i < defaultChildNodes.length; i++) {
            const child = defaultChildNodes[i];
            if (child.nodeType === 1) {
              parseElement(child as Element, transform);
            }
          }
          break;
      }
    }
    
    console.log(`开始解析常规SVG元素，hasMetadataShapes=${hasMetadataShapes}`);
    
    // 如果已经存在metadata形状定义，跳过常规SVG元素遍历以避免重复创建形状
    console.log(`准备解析常规SVG元素，hasMetadataShapes=${hasMetadataShapes}, shapes.length=${shapes.length}`);
    if (!hasMetadataShapes) {
      console.log('开始解析SVG根元素的子元素...');
      
      // 保持SVG元素的原始绘制顺序：按文档顺序遍历所有元素
      // 使用深度优先遍历，确保图层顺序正确
      const traverseElements = (element: Element, parentTransform?: string, parentOpacity: number = 1): void => {
        const tagName = element.tagName.toLowerCase();
        
        // 修复：移除对当前元素的parseElement调用，避免双重解析
        // 真正的形状创建应该在parseElement函数中完成
        // 这里只负责递归处理子元素
        
        // 按顺序递归处理所有子元素（包括group元素的子元素）
        const childNodes = element.childNodes || [];
        for (let i = 0; i < childNodes.length; i++) {
          const child = childNodes[i];
          if (child.nodeType === 1) {
            // 获取当前元素的transform和opacity传递给子元素
            const currentTransform = element.getAttribute('transform') || parentTransform;
            const elementOpacityAttr = element.getAttribute('opacity');
            const elementOpacityValue = elementOpacityAttr ? parseFloat(elementOpacityAttr) : 1;
            const currentOpacity = parentOpacity * elementOpacityValue;
            
            // 直接调用parseElement处理子元素，避免双重解析
            parseElement(child as Element, currentTransform, currentOpacity);
          }
        }
      };
      
      // 从SVG根元素开始遍历
      // 修复：直接调用parseElement处理根元素，然后使用traverseElements处理子元素
      parseElement(svgElement, undefined, 1);
    } else {
      console.log('跳过常规SVG元素解析，因为hasMetadataShapes=true');
    }
    
    console.log(`Parsing completed. Found ${shapes.length} shapes.`);
    return { shapes, imageData };
    
  } catch (error) {
    console.error('Error parsing SVG:', error);
    
    // 提供更详细的错误信息
    if (svgString) {
      console.error('SVG文件内容预览:', svgString.substring(0, 500) + '...');
      console.error('SVG文件长度:', svgString.length);
      
      // 检查常见问题
      if (!svgString.includes('<svg')) {
        console.error('错误原因: SVG文件缺少根元素<svg>');
      } else if (!svgString.includes('</svg>')) {
        console.error('错误原因: SVG文件缺少闭合标签</svg>');
      } else if (svgString.length < 10) {
        console.error('错误原因: SVG文件内容过短');
      }
    }
    
    return { shapes: [], imageData: {} };
  }
}

/**
 * 将SVG形状数据添加到tldraw编辑器中
 */
export function addSvgShapesToEditor(
  editor: Editor, 
  shapes: SvgShapeData[], 
  canvasCenterX: number = 0, 
  canvasCenterY: number = 0,
  imageData: Record<string, { base64Data: string, width: number, height: number }> = {},
  disableAutoCenter: boolean = false
): void {
  const shapeMap = new Map<string, TLShape>()
  
  // 第一步：计算所有形状的边界框
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  // 缓存路径解析结果，避免重复解析
  const pathSegmentsCache = new Map<string, any[]>();
  
  shapes.forEach(shapeData => {
    if (shapeData.type === 'draw' && shapeData.segments && shapeData.segments.length > 0) {
      shapeData.segments.forEach((segment: any) => {
        if (segment.points && segment.points.length > 0) {
          segment.points.forEach((point: any) => {
            const px = (shapeData.x || 0) + (point.x || 0)
            const py = (shapeData.y || 0) + (point.y || 0)
            minX = Math.min(minX, px)
            minY = Math.min(minY, py)
            maxX = Math.max(maxX, px)
            maxY = Math.max(maxY, py)
          })
        }
      })
    } else if (shapeData.type === 'path' && shapeData.d) {
      // 对于常规SVG的path类型，需要解析路径数据来计算边界框
      try {
        let segments: any[] = [];
        
        // 检查缓存中是否已有解析结果
        if (pathSegmentsCache.has(shapeData.d)) {
          segments = pathSegmentsCache.get(shapeData.d)!;
          console.log('使用缓存的路径解析结果计算边界框');
        } else {
          // 首次解析，并缓存结果
          segments = reverseSvgPathToSegments(shapeData.d, { bezierSegments: 32, arcSegments: 48 });
          pathSegmentsCache.set(shapeData.d, segments);
          console.log('首次解析路径并缓存结果');
        }
        
        // 获取变换矩阵
        const transformMatrix = shapeData.transform ? parseTransform(shapeData.transform).matrix : [1, 0, 0, 1, 0, 0];
        
        segments.forEach((segment: any) => {
          if (segment.points && segment.points.length > 0) {
            segment.points.forEach((point: any) => {
              // 应用变换矩阵到每个点
              let transformedX = point.x;
              let transformedY = point.y;
              
              if (shapeData.transform) {
                const [a, b, c, d, e, f] = transformMatrix;
                transformedX = a * point.x + c * point.y + e;
                transformedY = b * point.x + d * point.y + f;
              }
              
              const px = (shapeData.x || 0) + transformedX
              const py = (shapeData.y || 0) + transformedY
              minX = Math.min(minX, px)
              minY = Math.min(minY, py)
              maxX = Math.max(maxX, px)
              maxY = Math.max(maxY, py)
            })
          }
        })
      } catch (error) {
        console.warn('路径解析失败，使用默认边界框计算:', error)
        const x = shapeData.x || 0
        const y = shapeData.y || 0
        const width = shapeData.w || 100
        const height = shapeData.h || 100
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x + width)
        maxY = Math.max(maxY, y + height)
      }
    } else {
      const x = shapeData.x || 0
      const y = shapeData.y || 0
      const width = shapeData.w || 100
      const height = shapeData.h || 100
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x + width)
      maxY = Math.max(maxY, y + height)
    }
  })

  const contentCenterX = (minX + maxX) / 2
  const contentCenterY = (minY + maxY) / 2
  const contentWidth = maxX - minX
  const contentHeight = maxY - minY
  const canvasWidth = 800
  const canvasHeight = 600
  
  // 正确理解viewBox：viewBox的0 0代表视图左上角，不是中心
  // 当SVG内容在不同位置时，viewBox的起始坐标会有正负值
  // 导入时需要将这些坐标逆转，才能让内容正确显示在视图中心
  
  console.log('=== viewBox坐标处理分析 ===')
  console.log(`viewBox起始坐标: (${minX}, ${minY})`)
  console.log(`内容边界: (${minX}, ${minY}) - (${maxX}, ${maxY})`)
  console.log(`内容尺寸: ${contentWidth}x${contentHeight}`)
  console.log(`内容中心点: (${contentCenterX}, ${contentCenterY})`)
  
  // 计算缩放比例
  const scaleX = canvasWidth * 0.8 / Math.max(contentWidth, 1)
  const scaleY = canvasHeight * 0.8 / Math.max(contentHeight, 1)
  const scale = Math.min(scaleX, scaleY, 1)
  
  // 关键修复：viewBox坐标逆转
  // viewBox的起始坐标(minX, minY)表示内容相对于视图左上角的偏移
  // 为了在画布中心显示，需要逆转这个偏移量
  const offsetX = disableAutoCenter ? 0 : canvasCenterX - minX * scale
  const offsetY = disableAutoCenter ? 0 : canvasCenterY - minY * scale
  
  console.log(`缩放比例: ${scale}`)
  console.log(`viewBox坐标逆转偏移量: (${offsetX}, ${offsetY})`)
  console.log(`自动居中: ${!disableAutoCenter}`)
  
  const hasMetadataShapes = shapes.some(shape => 
    shape.type === 'draw' || shape.type === 'geo' || shape.type === 'image' || shape.type === 'text'
  )

  console.log(`检测到SVG类型: ${hasMetadataShapes ? '包含metadata的SVG' : '常规SVG'}`)

  // ---------- 常规 SVG 分支 ----------
  if (!hasMetadataShapes) {
    console.log('常规SVG处理：统一处理所有path元素')
    
    // 对于常规SVG，需要应用viewBox坐标逆转偏移量
    // const disableAutoCenterForRegularSvg = true;
    
    // 设置全局变量，指示当前正在处理常规SVG
      // (globalThis as any).__disableAutoCenterForRegularSvg__ = disableAutoCenterForRegularSvg;
    
    // 关键修复：对于常规SVG，需要应用viewBox坐标逆转偏移量，但不应用自动居中
    // 这样可以正确处理transform矩阵中的大数值，同时保持元素间的相对位置关系
    const regularOffsetX = offsetX;  // 应用viewBox坐标逆转偏移量
    const regularOffsetY = offsetY;  // 应用viewBox坐标逆转偏移量
    
    console.log(`常规SVG处理：禁用自动居中，但应用viewBox坐标逆转偏移量`)
    console.log(`viewBox坐标逆转偏移量: (${regularOffsetX}, ${regularOffsetY})`)
    
    const pathsToProcess: any[] = []
    shapes.forEach(shapeData => {
      if (shapeData.type === 'path') {
        console.log(`处理path类型: ${shapeData.id}, transform偏移: (${shapeData.x}, ${shapeData.y})`)
        pathsToProcess.push(shapeData)
      }
    })
    console.log(`总共需要处理 ${pathsToProcess.length} 个path元素`)

    // 简易函数：提取坐标点用于回退
    const extractPointsFromPath = (d: string) => {
      const points: { x: number; y: number }[] = []
      const regex = /(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/g
      let match
      while ((match = regex.exec(d)) !== null) {
        points.push({ x: parseFloat(match[1]), y: parseFloat(match[2]) })
      }
      return points
    }

    pathsToProcess.forEach(shapeData => {
      const commonProps = {
        color: getTldrawColorFromSvg(shapeData.color || 'black'),
        fill: getTldrawFillStyleFromSvg(shapeData.fill || 'none'),
        size: shapeData.size || 'm',
        dash: shapeData.dash || 'draw',
        scale: shapeData.scale || 1,
      }

      if (shapeData.d) {
        // === 路径数据已经在前面的步骤中简化过，直接使用 ===
        const simplifiedD = shapeData.d;
        console.log(`处理简化后Path元素: d="${simplifiedD.substring(0, 1000)}...", fill="${shapeData.fill}", stroke="${shapeData.stroke}"`)
        
        // === 安全解析路径 ===
        let rawSegments: any[] = []
        try {
          // 检查缓存中是否已有解析结果
          if (pathSegmentsCache.has(simplifiedD)) {
            rawSegments = pathSegmentsCache.get(simplifiedD)!;
            console.log('使用缓存的路径解析结果创建形状');
          } else {
            // 如果缓存中没有，重新解析（理论上不应该发生，因为边界框计算时已经缓存）
            rawSegments = reverseSvgPathToSegments(simplifiedD, { bezierSegments: 32, arcSegments: 48 });
            pathSegmentsCache.set(simplifiedD, rawSegments);
            console.log('重新解析路径创建形状（缓存未命中）');
          }
        } catch (err) {
          console.warn('⚠️ reverseSvgPathToSegments 解析失败，回退为折线模式:', err)
          const points = extractPointsFromPath(simplifiedD)
          rawSegments = points.length > 0 ? [{ type: 'free', points }] : []
        }
        if (!rawSegments || rawSegments.length === 0) return

        // === 修复：过滤NaN值并正确处理路径坐标 ===
        // 获取变换矩阵
        const transformMatrix = shapeData.transform ? parseTransform(shapeData.transform).matrix : [1, 0, 0, 1, 0, 0];
        
        let segments = rawSegments.map(seg => ({
          ...seg,
          points: seg.points
            .filter((p:any) => !Number.isNaN(p.x) && !Number.isNaN(p.y))
            .map((p:any) => {
              // 应用变换矩阵到每个点
              let transformedX = p.x;
              let transformedY = p.y;
              
              if (shapeData.transform) {
                const [a, b, c, d, e, f] = transformMatrix;
                transformedX = a * p.x + c * p.y + e;
                transformedY = b * p.x + d * p.y + f;
              }
              
              return {
                x: transformedX,
                y: transformedY,
                z: p.z ?? 0.5,
              };
            }),
        })).filter(seg => seg.points.length > 0)

        if (segments.length === 0) {
          console.warn('⚠️ 路径解析后无有效坐标点，跳过此路径')
          return
        }

        // === 修复：移除双重变换，路径解析阶段已经正确应用了transform ===
        // 注意：路径解析阶段已经正确应用了transform矩阵并计算了形状位置
        // 这里不再重复应用transform，避免破坏笔划间的相对位置关系
        console.log(`使用路径解析阶段已应用的transform位置: (${shapeData.x}, ${shapeData.y})`)

        // === 修复：使用shapeData的原始坐标加上导入位置偏移量和viewBox坐标逆转偏移量 ===
        const x = (shapeData.x || 0) + canvasCenterX + regularOffsetX  // 添加导入位置X偏移量和viewBox坐标逆转偏移量
        const y = (shapeData.y || 0) + canvasCenterY + regularOffsetY  // 添加导入位置Y偏移量和viewBox坐标逆转偏移量
        
        console.log(`常规SVG处理 - 形状ID: ${shapeData.id}, 原始坐标: (${shapeData.x || 0}, ${shapeData.y || 0}), 导入位置偏移量: (${canvasCenterX}, ${canvasCenterY}), viewBox偏移量: (${regularOffsetX}, ${regularOffsetY}), 最终坐标: (${x}, ${y})`)

        // === 修复：将导入位置偏移量和viewBox坐标逆转偏移量应用到路径的每个点上 ===
        // 不仅仅是形状的x和y坐标，还需要将偏移量应用到路径的每个点上
        const adjustedSegments = segments.map(seg => ({
          ...seg,
          points: seg.points.map((point: any) => ({
            x: point.x + canvasCenterX + regularOffsetX,  // 为每个点添加X偏移量和viewBox偏移量
            y: point.y + canvasCenterY + regularOffsetY,  // 为每个点添加Y偏移量和viewBox偏移量
            z: point.z ?? 0.5,
          })),
        }));

        // 判断路径是否闭合（检查第一个segment的起点和终点是否相同，使用容差比较）
        let isClosed = false;
        if (adjustedSegments.length > 0 && adjustedSegments[0].points.length > 1) {
          const firstPoint = adjustedSegments[0].points[0];
          const lastPoint = adjustedSegments[0].points[adjustedSegments[0].points.length - 1];
          // 使用容差比较，避免浮点数精度问题
          isClosed = Math.abs(firstPoint.x - lastPoint.x) < 0.001 && 
                    Math.abs(firstPoint.y - lastPoint.y) < 0.001;
        }

        // === 修复：根据SVG原始填充属性决定是否填充，而不是仅依赖路径闭合 ===
        // 如果SVG元素有填充属性且不是'none'，则应该填充，即使路径不闭合
        const shouldFill = commonProps.fill !== 'none' && commonProps.fill !== undefined;
        
        const pathProps: any = {
          segments: adjustedSegments,  // 使用调整后的segments
          isComplete: true,
          isPen: false,
          isClosed,
          color: getTldrawColorFromSvg(commonProps.color),
          fill: shouldFill ? getTldrawFillStyleFromSvg(commonProps.fill) : 'none',
          size: commonProps.size,
          dash: commonProps.dash,
          scale: commonProps.scale,
        }

        const drawShape = editor.createShape({
          type: 'draw',
          x: x, // 使用调整后的坐标
          y: y, // 使用调整后的坐标
          opacity:
            shapeData.opacity !== undefined && shapeData.opacity !== null
              ? shapeData.opacity
              : 1,
          props: pathProps,
        })

        if (
          shapeData.opacity !== undefined &&
          shapeData.opacity !== null &&
          shapeData.opacity < 1
        ) {
          editor.setOpacityForNextShapes(shapeData.opacity)
          editor.setOpacityForSelectedShapes(shapeData.opacity)
        }

        shapeMap.set(shapeData.id, drawShape as unknown as TLShape)
      }
    })

    console.log('常规SVG处理完成，跳过后续metadata SVG处理')
    return;
  } else {
    // 包含metadata的SVG处理分支：处理所有形状类型
    console.log('包含metadata的SVG处理：处理所有形状类型');
    
    // 对于包含metadata的SVG，使用原始的disableAutoCenter设置
    const offsetX = disableAutoCenter ? 0 : canvasCenterX - contentCenterX * scale
    const offsetY = disableAutoCenter ? 0 : canvasCenterY - contentCenterY * scale
    
    console.log(`内容边界框: minX=${minX}, minY=${minY}, maxX=${maxX}, maxY=${maxY}`)
    console.log(`内容尺寸: ${contentWidth}x${contentHeight}`)
    console.log(`缩放比例: ${scale}`)
    console.log(`统一偏移量: (${offsetX}, ${offsetY})`)
    console.log(`自动居中: ${!disableAutoCenter}`)
      
    shapes.forEach(shapeData => {
        console.log(`处理形状类型: ${shapeData.type}`);
      
        // 提取通用的 tldraw 样式属性
        const commonProps = {
          color: getTldrawColorFromSvg(shapeData.color || 'black'),
          fill: getTldrawFillStyleFromSvg(shapeData.fill || 'none'),
          size: shapeData.size || 'm',
          dash: shapeData.dash || 'draw',
          scale: shapeData.scale || 1,
          // 注意：opacity属性不在这里设置，因为不同形状类型需要不同的透明度处理方式
        };

        switch (shapeData.type) {
        case 'draw':
          // draw类型：直接导入（修复ink自定义UI生成的draw类型）
          if (shapeData.segments && shapeData.segments.length > 0) {
            // 创建draw形状的props，排除可能不支持的opacity属性
            const drawProps: any = {
              segments: shapeData.segments,
              isComplete: shapeData.isComplete !== undefined ? shapeData.isComplete : true,
              isPen: shapeData.isPen !== undefined ? shapeData.isPen : false,
              isClosed: shapeData.isClosed !== undefined ? shapeData.isClosed : false,
              color: getTldrawColorFromSvg(shapeData.color || 'black'),
              fill: getTldrawFillStyleFromSvg(shapeData.fill || 'none'),
              size: shapeData.size || 'm',
              dash: shapeData.dash || 'draw',
              scale: shapeData.scale || 1,
              // 注意：draw形状不支持opacity属性，所以不包含它
            };
            
            const drawShape = editor.createShape({
              type: 'draw',
              x: (shapeData.x || 0) + offsetX, // 只应用偏移量，不缩放
              y: (shapeData.y || 0) + offsetY, // 只应用偏移量，不缩放
              opacity: shapeData.opacity !== undefined && shapeData.opacity !== null ? shapeData.opacity : 1,
              props: drawProps // 不应用缩放比例
            });
            
            // 使用tldraw的正确API方法设置透明度，而不是通过props
            if (shapeData.opacity !== undefined && shapeData.opacity !== null && shapeData.opacity < 1) {
              // 使用tldraw的setOpacityForNextShapes方法设置透明度
              editor.setOpacityForNextShapes(shapeData.opacity);
              // 同时设置当前形状的透明度
              editor.setOpacityForSelectedShapes(shapeData.opacity);
            }
            
            shapeMap.set(shapeData.id, drawShape as unknown as TLShape);
          } else {
            console.warn('Draw类型缺少segments属性，跳过导入');
          }
          break;
          
        case 'path':
          // path类型：转换为draw类型
          if (shapeData.d) {
            // === metadata分支的path类型数据已经是处理过的，直接使用 ===
            console.log('metadata分支 - 路径数据长度:', shapeData.d.length, '字符')
            
            // 使用逆向还原函数，从SVG path数据还原为segments格式
            let segments: any[] = [];
            
            // 检查缓存中是否已有解析结果
            if (pathSegmentsCache.has(shapeData.d)) {
              segments = pathSegmentsCache.get(shapeData.d)!;
              console.log('metadata分支：使用缓存的路径解析结果');
            } else {
              // 如果缓存中没有，重新解析
              segments = reverseSvgPathToSegments(shapeData.d);
              pathSegmentsCache.set(shapeData.d, segments);
              console.log('metadata分支：首次解析路径并缓存结果');
            }
            
            // 修复坐标计算：使用shapeData的x/y信息，而不是transform
            const x = shapeData.x || 0;
            const y = shapeData.y || 0;
            
            // 判断路径是否闭合：通过浮点数比较检查起点和终点是否相同
            let isClosed = false;
            if (segments.length > 0 && segments[0].points.length > 1) {
              const firstPoint = segments[0].points[0];
              const lastPoint = segments[0].points[segments[0].points.length - 1];
              // 使用容差比较，避免浮点数精度问题
              isClosed = Math.abs(firstPoint.x - lastPoint.x) < 0.001 && 
                        Math.abs(firstPoint.y - lastPoint.y) < 0.001;
            }
            
            // 创建path形状的props，正确应用样式系统
            const pathProps: any = {
              segments: segments,
              isComplete: true,
              isPen: false,
              isClosed: isClosed, // 在props级别设置isClosed属性
              color: getTldrawColorFromSvg(shapeData.color || 'black'),
              fill: isClosed ? getTldrawFillStyleFromSvg(shapeData.fill || 'none') : 'none', // 只有闭合路径才应用填充
              size: shapeData.size || 'm',
              dash: shapeData.dash || 'draw',
              scale: shapeData.scale || 1,
              // 注意：tldraw的形状系统通过样式系统管理透明度，不直接在props中设置opacity
            };
            
            const pathShape = editor.createShape({
              type: 'draw',
              x: x + offsetX, // 只应用偏移量，不缩放
              y: y + offsetY, // 只应用偏移量，不缩放
              opacity: shapeData.opacity !== undefined && shapeData.opacity !== null ? shapeData.opacity : 1,
              props: pathProps // 不应用缩放比例
            });
            
            // 使用tldraw的正确API方法设置透明度，而不是通过OpacityManager
            if (shapeData.opacity !== undefined && shapeData.opacity !== null && shapeData.opacity < 1) {
              // 使用tldraw的setOpacityForNextShapes方法设置透明度
              editor.setOpacityForNextShapes(shapeData.opacity);
              // 同时设置当前形状的透明度
              editor.setOpacityForSelectedShapes(shapeData.opacity);
            }
            
            shapeMap.set(shapeData.id, pathShape as unknown as TLShape);
          }
          break;
          
        case 'geo':
          // geo类型：直接导入（修复opacity属性错误）
          if (shapeData.w && shapeData.h) {
            // 创建geo形状的props
            const geoProps: any = {
              geo: shapeData.geo || 'rectangle',
              w: shapeData.w,
              h: shapeData.h,
              color: getTldrawColorFromSvg(shapeData.color || 'black'),
              fill: getTldrawFillStyleFromSvg(shapeData.fill || 'none'),
              size: shapeData.size || 'm',
              dash: shapeData.dash || 'draw',
              scale: shapeData.scale || 1,
            };
            
            // 创建形状对象，在顶层设置opacity属性
            const geoShape = editor.createShape({
              type: 'geo',
              x: disableAutoCenter ? (shapeData.x || 0) : (shapeData.x || 0) + offsetX, // 如果禁用自动居中，则使用原始坐标
              y: disableAutoCenter ? (shapeData.y || 0) : (shapeData.y || 0) + offsetY, // 如果禁用自动居中，则使用原始坐标
              opacity: shapeData.opacity !== undefined && shapeData.opacity !== null ? shapeData.opacity : 1,
              props: geoProps // 不应用缩放比例
            });
            
            // 使用tldraw的正确API方法设置透明度，而不是通过OpacityManager
            if (shapeData.opacity !== undefined && shapeData.opacity !== null && shapeData.opacity < 1) {
              // 使用tldraw的setOpacityForNextShapes方法设置透明度
              editor.setOpacityForNextShapes(shapeData.opacity);
              // 同时设置当前形状的透明度
              editor.setOpacityForSelectedShapes(shapeData.opacity);
            }
            
            shapeMap.set(shapeData.id, geoShape as unknown as TLShape);
          }
          break;
          
        case 'image':
          // image类型：直接导入（修复ink插件生成的image类型）
          if (shapeData.w && shapeData.h) {
            // 修复：即使没有assetId也要创建image形状，确保metadata中定义的image能够正确显示
            if (!shapeData.assetId) {
              // 生成一个基于形状ID的assetId
              shapeData.assetId = `asset:${shapeData.id.replace('shape:', '')}`;
              console.log(`为metadata中的image形状生成assetId: ${shapeData.assetId}`);
            }
            
            // 创建asset资源 - 修复：使用提取的图片数据创建asset资源
            try {
              // 获取所有可用的图片数据键
              const imageDataKeys = Object.keys(imageData);
              
              // 优先使用提取的图片数据，其次使用assetInfo，最后使用基础asset资源
              if (imageDataKeys.length > 0) {
                // 修复：使用位置信息进行精确匹配来正确选择对应的图片数据
                let selectedImageKey = null;
                let selectedImageData = null;
                
                // 尝试通过位置信息匹配找到对应的图片数据
                for (const imageKey of imageDataKeys) {
                  const imageDataItem = imageData[imageKey] as { base64Data: string, width: number, height: number, x: number, y: number };
                  // 如果图片数据的位置与当前形状的位置匹配（允许一定的误差）
                  if (Math.abs((imageDataItem.x || 0) - (shapeData.x || 0)) < 1 && 
                      Math.abs((imageDataItem.y || 0) - (shapeData.y || 0)) < 1) {
                    selectedImageKey = imageKey;
                    selectedImageData = imageDataItem;
                    console.log(`通过位置匹配找到图片数据: ${selectedImageKey} (位置: ${imageDataItem.x || 0},${imageDataItem.y || 0}) 匹配形状位置 (${shapeData.x || 0},${shapeData.y || 0})`);
                    break;
                  }
                }
                
                // 如果没有找到位置匹配，尝试使用尺寸匹配作为备选方案
                if (!selectedImageKey) {
                  for (const imageKey of imageDataKeys) {
                    const imageDataItem = imageData[imageKey] as { base64Data: string, width: number, height: number, x: number, y: number };
                    // 如果图片数据的尺寸与当前形状的尺寸匹配（允许一定的误差）
                    if (Math.abs(imageDataItem.width - shapeData.w) < 1 && 
                        Math.abs(imageDataItem.height - shapeData.h) < 1) {
                      selectedImageKey = imageKey;
                      selectedImageData = imageDataItem;
                      console.log(`通过尺寸匹配找到图片数据: ${selectedImageKey} (${imageDataItem.width}x${imageDataItem.height}) 匹配形状尺寸 (${shapeData.w}x${shapeData.h})`);
                      break;
                    }
                  }
                }
                
                // 如果位置和尺寸匹配都失败，使用索引匹配作为最后备选方案
                if (!selectedImageKey) {
                  // 获取当前处理的image形状索引
                  const imageShapes = shapes.filter(s => s.type === 'image');
                  const imageShapeIndex = imageShapes.findIndex(s => s.id === shapeData.id);
                  
                  // 直接使用索引选择对应的图片数据，确保索引在有效范围内
                  const selectedImageIndex = imageShapeIndex >= 0 && imageShapeIndex < imageDataKeys.length 
                    ? imageShapeIndex 
                    : 0; // 如果索引超出范围，使用第一张图片
                  selectedImageKey = imageDataKeys[selectedImageIndex];
                  selectedImageData = imageData[selectedImageKey];
                  console.log(`通过索引匹配选择图片数据: ${selectedImageKey} (索引: ${selectedImageIndex})`);
                }
                
                // 使用提取的图片数据创建asset资源
                // 修复：将base64数据转换为有效的data URL格式
                if (selectedImageData) {
                  const dataUrl = `data:image/png;base64,${selectedImageData.base64Data}`;
                  editor.createAssets([{
                    id: shapeData.assetId as any, // 使用类型断言解决TLAssetId类型问题
                    typeName: 'asset',
                    type: 'image',
                    props: {
                      name: `imported-image-${selectedImageKey}`,
                      src: dataUrl, // 使用有效的data URL格式
                      w: selectedImageData.width || shapeData.w,
                      h: selectedImageData.height || shapeData.h,
                      mimeType: 'image/png',
                      isAnimated: false,
                    },
                    meta: {},
                  }]);
                } else {
                  // 如果没有找到匹配的图片数据，创建基础asset资源
                  editor.createAssets([{
                    id: shapeData.assetId as any, // 使用类型断言解决TLAssetId类型问题
                    typeName: 'asset',
                    type: 'image',
                    props: {
                      name: 'imported-image',
                      src: '', // 空src，但确保asset存在
                      w: shapeData.w,
                      h: shapeData.h,
                      mimeType: 'image/png',
                      isAnimated: false,
                    },
                    meta: {},
                  }]);
                }
                console.log(`创建asset资源（使用图片数据 ${selectedImageKey}）: ${shapeData.assetId}`);
              } else if (shapeData.assetInfo) {
                // 使用完整的assetInfo创建asset资源
                editor.createAssets([{
                  id: shapeData.assetId as any, // 使用类型断言解决TLAssetId类型问题
                  typeName: 'asset',
                  type: 'image',
                  props: {
                    name: shapeData.assetInfo.props?.name || 'imported-image',
                    src: shapeData.assetInfo.props?.src || '',
                    w: shapeData.assetInfo.props?.w || shapeData.w,
                    h: shapeData.assetInfo.props?.h || shapeData.h,
                    mimeType: shapeData.assetInfo.props?.mimeType || 'image/png',
                    isAnimated: shapeData.assetInfo.props?.isAnimated || false,
                  },
                  meta: {},
                }]);
                console.log(`创建asset资源（完整信息）: ${shapeData.assetId}`);
              } else {
                // 没有assetInfo和图片数据时创建基础asset资源
                editor.createAssets([{
                  id: shapeData.assetId as any, // 使用类型断言解决TLAssetId类型问题
                  typeName: 'asset',
                  type: 'image',
                  props: {
                    name: 'imported-image',
                    src: '', // 空src，但确保asset存在
                    w: shapeData.w,
                    h: shapeData.h,
                    mimeType: 'image/png',
                    isAnimated: false,
                  },
                  meta: {},
                }]);
                console.log(`创建asset资源（基础信息）: ${shapeData.assetId}`);
              }
            } catch (assetError) {
              console.warn(`创建asset资源失败: ${assetError}，继续创建image形状`);
            }
            
            const imageShape = editor.createShape({
              type: 'image',
              x: disableAutoCenter ? (shapeData.x || 0) : (shapeData.x || 0) + offsetX, // 如果禁用自动居中，则使用原始坐标
              y: disableAutoCenter ? (shapeData.y || 0) : (shapeData.y || 0) + offsetY, // 如果禁用自动居中，则使用原始坐标
              opacity: shapeData.opacity !== undefined && shapeData.opacity !== null ? shapeData.opacity : 1,
              props: {
                w: shapeData.w, // 不应用缩放比例
                h: shapeData.h,  // 不应用缩放比例
                assetId: shapeData.assetId,
                // 注意：image形状可能不支持opacity属性，所以不包含它
              }
            });
            
            // 使用tldraw的正确API方法设置透明度，而不是通过OpacityManager
            if (shapeData.opacity !== undefined && shapeData.opacity !== null && shapeData.opacity < 1) {
              // 使用tldraw的setOpacityForNextShapes方法设置透明度
              editor.setOpacityForNextShapes(shapeData.opacity);
              // 同时设置当前形状的透明度
              editor.setOpacityForSelectedShapes(shapeData.opacity);
            }
            
            shapeMap.set(shapeData.id, imageShape as unknown as TLShape);
            console.log(`创建image形状: ${shapeData.id}，assetId: ${shapeData.assetId}`);
          } else {
            console.warn('Image类型缺少必要的尺寸属性，跳过导入');
          }
          break;
          
        case 'text':
          // text类型：直接导入
          if (shapeData.text) {
            const textShape = editor.createShape({
              type: 'text',
              x: disableAutoCenter ? (shapeData.x || 0) : (shapeData.x || 0) * scale + offsetX,
              y: disableAutoCenter ? (shapeData.y || 0) : (shapeData.y || 0) * scale + offsetY,
              opacity: shapeData.opacity !== undefined && shapeData.opacity !== null ? shapeData.opacity : 1,
              props: {
                text: shapeData.text,
                font: shapeData.font || 'draw',
                align: shapeData.align || 'middle',
                verticalAlign: shapeData.verticalAlign || 'middle',
                w: disableAutoCenter ? (shapeData.w || 200) : (shapeData.w || 200) * scale, // 如果禁用自动居中，则不应用缩放比例
                h: disableAutoCenter ? (shapeData.h || 100) : (shapeData.h || 100) * scale,  // 如果禁用自动居中，则不应用缩放比例
                ...commonProps,
              }
            });
            shapeMap.set(shapeData.id, textShape as unknown as TLShape);
          }
          break;
          
        case 'frame':
          // frame类型：直接导入
          const frameShape = editor.createShape({
            type: 'frame',
            x: disableAutoCenter ? (shapeData.x || 0) : (shapeData.x || 0) * scale + offsetX,
            y: disableAutoCenter ? (shapeData.y || 0) : (shapeData.y || 0) * scale + offsetY,
            opacity: shapeData.opacity !== undefined && shapeData.opacity !== null ? shapeData.opacity : 1,
            props: {
              w: disableAutoCenter ? (shapeData.w || 400) : (shapeData.w || 400) * scale, // 如果禁用自动居中，则不应用缩放比例
              h: disableAutoCenter ? (shapeData.h || 300) : (shapeData.h || 300) * scale,  // 如果禁用自动居中，则不应用缩放比例
            }
          });
          shapeMap.set(shapeData.id, frameShape as unknown as TLShape);
          break;
          
        case 'arrow':
          // arrow类型：直接导入
          if (shapeData.start && shapeData.end) {
            const arrowShape = editor.createShape({
              type: 'arrow',
              x: (shapeData.x || 0) * scale + offsetX,
              y: (shapeData.y || 0) * scale + offsetY,
              opacity: shapeData.opacity !== undefined && shapeData.opacity !== null ? shapeData.opacity : 1,
              props: {
                start: {
                  ...shapeData.start,
                  x: (shapeData.start.x || 0) * scale,
                  y: (shapeData.start.y || 0) * scale
                },
                end: {
                  ...shapeData.end,
                  x: (shapeData.end.x || 0) * scale,
                  y: (shapeData.end.y || 0) * scale
                },
                ...commonProps,
              }
            });
            shapeMap.set(shapeData.id, arrowShape as unknown as TLShape);
          }
          break;
          
        case 'note':
          // note类型：直接导入
          const noteShape = editor.createShape({
            type: 'note',
            x: (shapeData.x || 0) * scale + offsetX,
            y: (shapeData.y || 0) * scale + offsetY,
            opacity: shapeData.opacity !== undefined && shapeData.opacity !== null ? shapeData.opacity : 1,
            props: {
              text: shapeData.text || '',
              color: shapeData.color || 'black',
              size: shapeData.size || 'm',
              w: (shapeData.w || 200) * scale, // 应用缩放比例
              h: (shapeData.h || 100) * scale,  // 应用缩放比例
            }
          });
          shapeMap.set(shapeData.id, noteShape as unknown as TLShape);
          break;
          
        case 'line':
          // line类型：直接导入
          const lineShape = editor.createShape({
            type: 'line',
            x: (shapeData.x || 0) * scale + offsetX,
            y: (shapeData.y || 0) * scale + offsetY,
            opacity: shapeData.opacity !== undefined && shapeData.opacity !== null ? shapeData.opacity : 1,
            props: {
              ...commonProps,
            }
          });
          shapeMap.set(shapeData.id, lineShape as unknown as TLShape);
          break;
          
        case 'highlight':
          // highlight类型：直接导入
          const highlightShape = editor.createShape({
            type: 'highlight',
            x: (shapeData.x || 0) * scale + offsetX,
            y: (shapeData.y || 0) * scale + offsetY,
            opacity: shapeData.opacity !== undefined && shapeData.opacity !== null ? shapeData.opacity : 1,
            props: {
              ...commonProps,
            }
          });
          shapeMap.set(shapeData.id, highlightShape as unknown as TLShape);
          break;
          
        case 'bookmark':
          // bookmark类型：直接导入
          if (shapeData.url) {
            const bookmarkShape = editor.createShape({
              type: 'bookmark',
              x: (shapeData.x || 0) * scale + offsetX,
              y: (shapeData.y || 0) * scale + offsetY,
              opacity: shapeData.opacity !== undefined && shapeData.opacity !== null ? shapeData.opacity : 1,
              props: {
                url: shapeData.url,
                w: (shapeData.w || 200) * scale, // 应用缩放比例
                h: (shapeData.h || 100) * scale,  // 应用缩放比例
              }
            });
            shapeMap.set(shapeData.id, bookmarkShape as unknown as TLShape);
          }
          break;
          
        case 'embed':
          // embed类型：直接导入
          if (shapeData.url) {
            const embedShape = editor.createShape({
              type: 'embed',
              x: (shapeData.x || 0) * scale + offsetX,
              y: (shapeData.y || 0) * scale + offsetY,
              opacity: shapeData.opacity !== undefined && shapeData.opacity !== null ? shapeData.opacity : 1,
              props: {
                url: shapeData.url,
                w: (shapeData.w || 200) * scale, // 应用缩放比例
                h: (shapeData.h || 100) * scale,  // 应用缩放比例
              }
            });
            shapeMap.set(shapeData.id, embedShape as unknown as TLShape);
          }
          break;
          
        case 'video':
          // video类型：直接导入
          if (shapeData.assetId) {
            const videoShape = editor.createShape({
              type: 'video',
              x: (shapeData.x || 0) * scale + offsetX,
              y: (shapeData.y || 0) * scale + offsetY,
              opacity: shapeData.opacity !== undefined && shapeData.opacity !== null ? shapeData.opacity : 1,
              props: {
                assetId: shapeData.assetId,
                w: (shapeData.w || 200) * scale, // 应用缩放比例
                h: (shapeData.h || 100) * scale,  // 应用缩放比例
              }
            });
            shapeMap.set(shapeData.id, videoShape as unknown as TLShape);
          }
          break;
          
        case 'group':
          // group类型：不创建形状，只记录group信息用于后续parentId设置
          console.log(`处理group类型: ${shapeData.id}，包含 ${shapeData.children?.length || 0} 个子形状`);
          // 不创建实际的group形状，只记录group信息
          shapeMap.set(shapeData.id, null as any);
          break;
          
        default:
          console.warn(`不支持的类型: ${shapeData.type}，跳过导入`);
          break;
      }
    });
    
    // 处理组结构 (使用 parentId 分组)
    shapes.forEach(shapeData => {
      if (shapeData.type === 'group' && shapeData.children && shapeData.children.length > 0) {
        console.log(`处理group ${shapeData.id}，包含 ${shapeData.children.length} 个子形状`);
        
        // 首先创建所有子形状
        shapeData.children.forEach(childShape => {
          console.log(`创建子形状: ${childShape.type} (${childShape.id})`);
          
          // 重新创建子形状，使用group的坐标作为偏移
          const commonProps = {
            color: childShape.color || 'black',
            fill: childShape.fill || 'none',
            size: childShape.size || 'm',
            dash: childShape.dash || 'draw',
            scale: childShape.scale || 1,
            // 注意：opacity不应该包含在commonProps中，因为它已经在顶层属性中设置
          };

          switch (childShape.type) {
            case 'draw':
              if (childShape.segments && childShape.segments.length > 0) {
                // 创建draw形状的props，排除可能不支持的opacity属性
                const drawProps: any = {
                  segments: childShape.segments,
                  isComplete: childShape.isComplete !== undefined ? childShape.isComplete : true,
                  isPen: childShape.isPen !== undefined ? childShape.isPen : false,
                  color: commonProps.color,
                  fill: commonProps.fill,
                  size: commonProps.size,
                  dash: commonProps.dash,
                  scale: commonProps.scale,
                  // 注意：draw形状可能不支持opacity属性，所以不包含它
                };
                
                const drawShape = editor.createShape({
                  type: 'draw',
                  x: (childShape.x || 0) * scale + offsetX,
                  y: (childShape.y || 0) * scale + offsetY,
                  opacity: childShape.opacity !== undefined && childShape.opacity !== null ? childShape.opacity : 1,
                  props: {
                    ...drawProps,
                    scale: (drawProps.scale || 1) * scale // 应用缩放比例
                  }
                });
                shapeMap.set(childShape.id, drawShape as unknown as TLShape);
              }
              break;
              
            case 'geo':
              if (childShape.w && childShape.h) {
                const geoProps: any = {
                  geo: childShape.geo || 'rectangle',
                  w: childShape.w,
                  h: childShape.h,
                  color: commonProps.color,
                  fill: commonProps.fill,
                  size: commonProps.size,
                  dash: commonProps.dash,
                  scale: commonProps.scale,
                };
                
                const geoShape = editor.createShape({
                  type: 'geo',
                  x: (childShape.x || 0) * scale + offsetX,
                  y: (childShape.y || 0) * scale + offsetY,
                  opacity: childShape.opacity !== undefined && childShape.opacity !== null ? childShape.opacity : 1,
                  props: {
                    ...geoProps,
                    w: (geoProps.w || 100) * scale, // 应用缩放比例
                    h: (geoProps.h || 100) * scale  // 应用缩放比例
                  }
                });
                shapeMap.set(childShape.id, geoShape as unknown as TLShape);
              }
              break;
              
            case 'image':
              if (childShape.w && childShape.h) {
                const imageShape = editor.createShape({
                  type: 'image',
                  x: (childShape.x || 0) * scale + offsetX,
                  y: (childShape.y || 0) * scale + offsetY,
                  opacity: childShape.opacity !== undefined && childShape.opacity !== null ? childShape.opacity : 1,
                  props: {
                    w: childShape.w * scale, // 应用缩放比例
                    h: childShape.h * scale,  // 应用缩放比例
                    assetId: childShape.assetId || 'placeholder-asset-id',
                    // 注意：image形状可能不支持opacity属性，所以不包含它
                  }
                });
                shapeMap.set(childShape.id, imageShape as unknown as TLShape);
              }
              break;
              
            case 'path':
              if (childShape.d) {
                // 将SVG路径转换为tldraw draw形状的segments
                const segments = convertSvgPathToSegments(childShape.d);
                if (segments.length > 0) {
                  const drawShape = editor.createShape({
                    type: 'draw',
                    x: (childShape.x || 0) * scale + offsetX,
                    y: (childShape.y || 0) * scale + offsetY,
                    opacity: childShape.opacity !== undefined && childShape.opacity !== null ? childShape.opacity : 1,
                    props: {
                      segments: segments,
                      isComplete: true,
                      isPen: false,
                      ...commonProps,
                      scale: (commonProps.scale || 1) * scale // 应用缩放比例
                    }
                  });
                  shapeMap.set(childShape.id, drawShape as unknown as TLShape);
                }
              }
              break;
              
            case 'group':
              // 处理嵌套的group：递归处理其子形状
              if (childShape.children && childShape.children.length > 0) {
                console.log(`处理嵌套group ${childShape.id}，包含 ${childShape.children.length} 个子形状`);
                
                // 递归处理嵌套group的子形状
                childShape.children.forEach(nestedChild => {
                  console.log(`创建嵌套子形状: ${nestedChild.type} (${nestedChild.id})`);
                  
                  const nestedCommonProps = {
                    color: nestedChild.color || 'black',
                    fill: nestedChild.fill || 'none',
                    size: nestedChild.size || 'm',
                    dash: nestedChild.dash || 'draw',
                    scale: nestedChild.scale || 1,
                    opacity: nestedChild.opacity || 1,
                  };

                  switch (nestedChild.type) {
                    case 'draw':
                      if (nestedChild.segments && nestedChild.segments.length > 0) {
                        // 创建draw形状的props，排除可能不支持的opacity属性
                        const drawProps: any = {
                          segments: nestedChild.segments,
                          isComplete: nestedChild.isComplete !== undefined ? nestedChild.isComplete : true,
                          isPen: nestedChild.isPen !== undefined ? nestedChild.isPen : false,
                          isClosed: nestedChild.isClosed !== undefined ? nestedChild.isClosed : false,
                          color: nestedCommonProps.color,
                          fill: nestedCommonProps.fill,
                          size: nestedCommonProps.size,
                          dash: nestedCommonProps.dash,
                          scale: nestedCommonProps.scale,
                          // 注意：draw形状可能不支持opacity属性，所以不包含它
                        };
                        
                        const drawShape = editor.createShape({
                          type: 'draw',
                          x: (nestedChild.x || 0) * scale + offsetX,
                          y: (nestedChild.y || 0) * scale + offsetY,
                          opacity: nestedChild.opacity !== undefined && nestedChild.opacity !== null ? nestedChild.opacity : 1,
                          props: {
                            ...drawProps,
                            scale: (drawProps.scale || 1) * scale // 应用缩放比例
                          }
                        });
                        shapeMap.set(nestedChild.id, drawShape as unknown as TLShape);
                      }
                      break;
                      
                    case 'geo':
                      if (nestedChild.w && nestedChild.h) {
                        const geoProps: any = {
                          geo: nestedChild.geo || 'rectangle',
                          w: nestedChild.w,
                          h: nestedChild.h,
                          color: nestedCommonProps.color,
                          fill: nestedCommonProps.fill,
                          size: nestedCommonProps.size,
                          dash: nestedCommonProps.dash,
                          scale: nestedCommonProps.scale,
                        };
                        
                        const geoShape = editor.createShape({
                          type: 'geo',
                          x: (nestedChild.x || 0) * scale + offsetX,
                          y: (nestedChild.y || 0) * scale + offsetY,
                          opacity: nestedChild.opacity !== undefined && nestedChild.opacity !== null ? nestedChild.opacity : 1,
                          props: {
                            ...geoProps,
                            w: (geoProps.w || 100) * scale, // 应用缩放比例
                            h: (geoProps.h || 100) * scale  // 应用缩放比例
                          }
                        });
                        shapeMap.set(nestedChild.id, geoShape as unknown as TLShape);
                      }
                      break;
                      
                    case 'image':
                      if (nestedChild.w && nestedChild.h) {
                        const imageShape = editor.createShape({
                          type: 'image',
                          x: (nestedChild.x || 0) * scale + offsetX,
                          y: (nestedChild.y || 0) * scale + offsetY,
                          opacity: nestedChild.opacity !== undefined && nestedChild.opacity !== null ? nestedChild.opacity : 1,
                          props: {
                            w: nestedChild.w * scale, // 应用缩放比例
                            h: nestedChild.h * scale,  // 应用缩放比例
                            assetId: nestedChild.assetId || 'placeholder-asset-id',
                            // 注意：image形状可能不支持opacity属性，所以不包含它
                          }
                        });
                        shapeMap.set(nestedChild.id, imageShape as unknown as TLShape);
                      }
                      break;
                      
                    case 'path':
                      if (nestedChild.d) {
                        const segments = convertSvgPathToSegments(nestedChild.d);
                        if (segments.length > 0) {
                          // 检查路径是否闭合：通过浮点数比较检查起点和终点是否相同
                          let isClosed = false;
                          if (segments[0].points.length > 1) {
                            const firstPoint = segments[0].points[0];
                            const lastPoint = segments[0].points[segments[0].points.length - 1];
                            // 使用容差比较，避免浮点数精度问题
                            isClosed = Math.abs(firstPoint.x - lastPoint.x) < 0.001 && 
                                      Math.abs(firstPoint.y - lastPoint.y) < 0.001;
                          }
                          
                          // 创建path形状的props，排除可能不支持的opacity属性
                          const pathProps: any = {
                            segments: segments,
                            isComplete: true,
                            isPen: false,
                            isClosed: isClosed,
                            color: nestedCommonProps.color,
                            fill: isClosed ? nestedCommonProps.fill : 'none',
                            size: nestedCommonProps.size,
                            dash: nestedCommonProps.dash,
                            scale: nestedCommonProps.scale,
                            // 注意：draw形状可能不支持opacity属性，所以不包含它
                          };
                          
                          const drawShape = editor.createShape({
                            type: 'draw',
                            x: (nestedChild.x || 0) * scale + offsetX,
                            y: (nestedChild.y || 0) * scale + offsetY,
                            opacity: nestedChild.opacity !== undefined && nestedChild.opacity !== null ? nestedChild.opacity : 1,
                            props: {
                              ...pathProps,
                              scale: (pathProps.scale || 1) * scale // 应用缩放比例
                            }
                          });
                          shapeMap.set(nestedChild.id, drawShape as unknown as TLShape);
                        }
                      }
                      break;
                      
                    default:
                      console.warn(`不支持的嵌套子形状类型: ${nestedChild.type}，跳过创建`);
                      break;
                  }
                });
                
                // 为嵌套group的子形状设置parentId
                childShape.children.forEach(nestedChild => {
                  const nestedTlShape = shapeMap.get(nestedChild.id);
                  if (nestedTlShape) {
                    editor.updateShape({
                      ...nestedTlShape,
                      parentId: childShape.id as TLShapeId
                    });
                  }
                });
                
                // 记录嵌套group信息
                shapeMap.set(childShape.id, null as any);
              }
              break;
              
            // 添加其他形状类型的处理...
            default:
              console.warn(`不支持的子形状类型: ${childShape.type}，跳过创建`);
              break;
          }
        });
        
        // 然后为子形状设置parentId
        shapeData.children.forEach(childShape => {
          const childTlShape = shapeMap.get(childShape.id);
          if (childTlShape) {
            editor.updateShape({
              ...childTlShape,
              parentId: shapeData.id as TLShapeId
            });
          }
        });
        
        // 记录group信息但不创建frame
        shapeMap.set(shapeData.id, null as any);
      }
    });
  }
}

/**
 * 将SVG路径数据转换为tldraw draw形状的segments格式（匹配ink生成的格式）
 * 根据tldraw的DrawShapeUtil.tsx文件，TLDrawShapeSegment的正确结构为：
 * points数组包含具有x、y、z属性的对象：[{x: number, y: number, z: number}]
 */
function convertSvgPathToSegments(d: string): any[] {
  const segments: any[] = [];
  
  // 检查输入是否有效
  if (!d || typeof d !== 'string' || d.trim() === '') {
    console.warn('convertSvgPathToSegments: 无效的路径数据', d);
    return segments;
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
        points: subPath.points,
        isClosed: subPath.isClosed || false
      });
    }
  }
  
  return segments;
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
 * 从路径数据中提取所有坐标点
 */
function extractPointsFromPath(pathData: string): {x: number, y: number}[] {
  const points: {x: number, y: number}[] = [];
  
  // 使用reverseSvgPathToSegments函数来解析路径数据，确保使用绝对坐标
  const segments = reverseSvgPathToSegments(pathData, { bezierSegments: 32, arcSegments: 48 });
  
  // 从所有子路径中提取点
  segments.forEach(segment => {
    if (segment.points && segment.points.length > 0) {
      segment.points.forEach((point: {x: number, y: number}) => {
        points.push({x: point.x, y: point.y});
      });
    }
  });
  
  return points;
}

/**
 * 计算路径点的边界框
 */
function calculatePathBounds(points: {x: number, y: number}[]): {minX: number, minY: number, maxX: number, maxY: number} {
  if (points.length === 0) {
    return {minX: 0, minY: 0, maxX: 0, maxY: 0};
  }
  
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  points.forEach(point => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });
  
  return {minX, minY, maxX, maxY};
}

/**
 * 将T命令（平滑二次贝塞尔曲线）转换为Q命令（二次贝塞尔曲线）
 */
function convertTCommandsToQ(pathData: string): string {
    // 改进的T命令转换：正确处理命令和参数合并的情况
    
    // 首先将路径数据分割为更细粒度的令牌
    const tokens: string[] = [];
    let currentToken = '';
    
    // 逐个字符处理，正确分割命令和参数
    for (let i = 0; i < pathData.length; i++) {
        const char = pathData[i];
        
        // 如果遇到字母（命令）且当前令牌不为空，则保存当前令牌
        if (/[A-Za-z]/.test(char) && currentToken.trim() !== '') {
            tokens.push(currentToken.trim());
            currentToken = '';
        }
        
        currentToken += char;
        
        // 如果遇到空格或逗号，且当前令牌不为空，则保存当前令牌
        if ((char === ' ' || char === ',') && currentToken.trim() !== '') {
            tokens.push(currentToken.trim());
            currentToken = '';
        }
    }
    
    // 添加最后一个令牌
    if (currentToken.trim() !== '') {
        tokens.push(currentToken.trim());
    }
    
    // 进一步分割合并的命令和参数（如 "T-0.0891,-3.5239"）
    const finalTokens: string[] = [];
    for (const token of tokens) {
        // 检查令牌是否包含命令和参数合并的情况
        const commandMatch = token.match(/^([A-Za-z])([\d\-\.\,]+)$/);
        if (commandMatch) {
            // 分割命令和参数
            finalTokens.push(commandMatch[1]);
            // 分割参数（可能包含逗号分隔的多个参数）
            const params = commandMatch[2].split(',');
            for (const param of params) {
                if (param.trim() !== '') {
                    finalTokens.push(param.trim());
                }
            }
        } else {
            finalTokens.push(token);
        }
    }
    
    console.log('T命令转换 - 令牌数组:', finalTokens);
    
    let result: string[] = [];
    let lastX = 0;
    let lastY = 0;
    let lastControlX: number | undefined;
    let lastControlY: number | undefined;
    
    for (let i = 0; i < finalTokens.length; i++) {
        const token = finalTokens[i];
        
        if (token === 'T' || token === 't') {
            console.log('发现T命令，位置:', i);
            
            // 处理T命令
            if (i + 2 < finalTokens.length) {
                const xStr = finalTokens[i + 1];
                const yStr = finalTokens[i + 2];
                
                // 检查参数是否为有效数字
                if (isNaN(parseFloat(xStr)) || isNaN(parseFloat(yStr))) {
                    console.warn('T命令参数无效，跳过转换:', xStr, yStr);
                    result.push(token, xStr, yStr); // 保留原始命令和参数
                    i += 2;
                    continue;
                }
                
                const x = parseFloat(xStr);
                const y = parseFloat(yStr);
                
                console.log('T命令参数:', x, y);
                console.log('上一个点:', lastX, lastY);
                
                // 对于平滑二次贝塞尔曲线，控制点应该是前一个控制点关于当前点的对称点
                // 如果前一个命令是Q或q，则使用对称控制点；否则使用当前点作为控制点
                let controlX = lastX;
                let controlY = lastY;
                
                // 检查是否有前一个控制点信息（需要记录前一个Q命令的控制点）
                if (typeof lastControlX !== 'undefined' && typeof lastControlY !== 'undefined') {
                    // 计算对称控制点：control = 2 * currentPoint - lastControlPoint
                    controlX = 2 * lastX - lastControlX;
                    controlY = 2 * lastY - lastControlY;
                    console.log('使用对称控制点:', controlX, controlY);
                } else {
                    console.log('没有前一个控制点，使用当前点作为控制点');
                }
                
                console.log('控制点:', controlX, controlY);
                
                // 添加Q命令
                result.push('Q');
                result.push(controlX.toString());
                result.push(controlY.toString());
                result.push(x.toString());
                result.push(y.toString());
                
                // 更新最后的位置和控制点
                lastControlX = controlX;
                lastControlY = controlY;
                lastX = x;
                lastY = y;
                
                i += 2; // 跳过参数
                console.log('T命令已转换为Q命令');
            } else {
                console.warn('T命令参数不足，保留原始命令');
                result.push(token);
            }
        } else if (token === 'M' || token === 'm') {
            // 记录起始点
            if (i + 2 < finalTokens.length) {
                const xStr = finalTokens[i + 1];
                const yStr = finalTokens[i + 2];
                
                // 检查参数是否为有效数字
                if (!isNaN(parseFloat(xStr)) && !isNaN(parseFloat(yStr))) {
                    lastX = parseFloat(xStr);
                    lastY = parseFloat(yStr);
                    result.push(token, xStr, yStr);
                    console.log('M命令，设置起点:', lastX, lastY);
                } else {
                    console.warn('M命令参数无效，保留原始命令和参数');
                    result.push(token, xStr, yStr);
                }
                i += 2;
            } else {
                console.warn('M命令参数不足，保留原始命令');
                result.push(token);
            }
        } else if (token === 'Q' || token === 'q') {
            // 记录Q命令的控制点和终点
            if (i + 4 < finalTokens.length) {
                const controlXStr = finalTokens[i + 1];
                const controlYStr = finalTokens[i + 2];
                const xStr = finalTokens[i + 3];
                const yStr = finalTokens[i + 4];
                
                // 检查参数是否为有效数字
                if (!isNaN(parseFloat(controlXStr)) && !isNaN(parseFloat(controlYStr)) && 
                    !isNaN(parseFloat(xStr)) && !isNaN(parseFloat(yStr))) {
                    const controlX = parseFloat(controlXStr);
                    const controlY = parseFloat(controlYStr);
                    lastX = parseFloat(xStr);
                    lastY = parseFloat(yStr);
                    
                    // 记录控制点用于后续T命令
                    lastControlX = controlX;
                    lastControlY = controlY;
                    
                    result.push(token, controlXStr, controlYStr, xStr, yStr);
                } else {
                    console.warn('Q命令参数无效，保留原始命令和参数');
                    result.push(token, controlXStr, controlYStr, xStr, yStr);
                }
                i += 4;
            } else {
                console.warn('Q命令参数不足，保留原始命令');
                result.push(token);
            }
        } else if (token === 'L' || token === 'l') {
            // 记录直线命令的终点
            if (i + 2 < finalTokens.length) {
                const xStr = finalTokens[i + 1];
                const yStr = finalTokens[i + 2];
                
                // 检查参数是否为有效数字
                if (!isNaN(parseFloat(xStr)) && !isNaN(parseFloat(yStr))) {
                    lastX = parseFloat(xStr);
                    lastY = parseFloat(yStr);
                    result.push(token, xStr, yStr);
                } else {
                    console.warn('L命令参数无效，保留原始命令和参数');
                    result.push(token, xStr, yStr);
                }
                i += 2;
            } else {
                console.warn('L命令参数不足，保留原始命令');
                result.push(token);
            }
        } else if (token === 'A' || token === 'a') {
            // 记录圆弧命令的终点
            if (i + 7 < finalTokens.length) {
                const xStr = finalTokens[i + 6];
                const yStr = finalTokens[i + 7];
                
                // 检查终点参数是否为有效数字
                if (!isNaN(parseFloat(xStr)) && !isNaN(parseFloat(yStr))) {
                    lastX = parseFloat(xStr);
                    lastY = parseFloat(yStr);
                    result.push(token, finalTokens[i + 1], finalTokens[i + 2], finalTokens[i + 3], finalTokens[i + 4], finalTokens[i + 5], xStr, yStr);
                } else {
                    console.warn('A命令终点参数无效，保留原始命令和参数');
                    result.push(token, finalTokens[i + 1], finalTokens[i + 2], finalTokens[i + 3], finalTokens[i + 4], finalTokens[i + 5], xStr, yStr);
                }
                i += 7;
            } else {
                console.warn('A命令参数不足，保留原始命令');
                result.push(token);
            }
        } else if (token === 'Z' || token === 'z') {
            // 闭合路径
            result.push(token);
        } else if (!isNaN(parseFloat(token))) {
            // 数字参数，直接添加
            result.push(token);
        } else {
            // 其他命令直接添加
            result.push(token);
        }
    }
    
    const converted = result.join(' ');
    console.log('T命令转换完成，结果:', converted);
    return converted;
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

export { parseSvgToShapesFallback };