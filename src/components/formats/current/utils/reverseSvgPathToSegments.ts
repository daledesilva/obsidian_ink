// reverseSvgPathToSegments.ts
export interface TLDrawPoint {
  x: number
  y: number
  z?: number
}

export interface TLDrawSegment {
  type: 'free'
  points: TLDrawPoint[]
}

/**
 * 配置：可根据需要调整采样密度
 * - bezierSegments: C/Q/S/T 的插值数量（>= 4），手写需要较高值，比如 20-32
 * - arcSegments: A 命令分段数（>= 8），弧通常需要更多细分，比如 24-48
 */
const DEFAULT_CONFIG = {
  bezierSegments: 24,
  arcSegments: 36,
  defaultZ: 0.5,
}

/**
 * 清理并规范 SVG path 字符串，保留大写命令和参数
 * 使后续解析更稳健
 */
export function sanitizeSvgPath(d: string): string {
  if (!d) return ''
  
  // 预处理：处理大型坐标值，特别是对于网络下载的SVG
  // 检查是否包含非常大的坐标值（可能是由于scale变换导致）
  let path = d;
  
  // 1. 统一逗号为空格并压缩空白
  path = path.replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  
  // 2. 在每个命令字母前后确保空格，便于切分（保留大小写，后面统一转大写）
  path = path.replace(/([a-zA-Z])/g, ' $1 ').replace(/\s+/g, ' ').trim()
  
  // 3. tokens 切分
  const tokens = path.split(/\s+/)
  const out: string[] = []
  
  // 处理大型坐标值：检测并规范化过大的坐标
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (/^[a-zA-Z]$/.test(t)) {
      const cmd = t.toUpperCase()
      out.push(cmd)
    } else {
      // 检查是否是数字，并且是否过大
      const num = parseFloat(t)
      if (!Number.isNaN(num) && Math.abs(num) > 10000) {
        // 对于过大的坐标值，进行缩放处理
        const scaleFactor = 0.01; // 缩小100倍
        const scaledValue = num * scaleFactor;
        out.push(scaledValue.toString())
      } else {
        out.push(t)
      }
    }
  }
  
  // 压缩并返回
  return out.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Helper: 将命令字符串拆解为 [{cmd, params:number[]}, ...]
 * 兼容任意空白、逗号分隔的数字
 */
function tokenizePath(d: string): { cmd: string; params: number[] }[] {
  const ret: { cmd: string; params: number[] }[] = []
  if (!d) return ret
  // 采用 regex 抽取命令 + 后续参数字符串
  const pairs = d.match(/[A-Za-z][^A-Za-z]*/g) || []
  for (const p of pairs) {
    const cmd = p[0].toUpperCase()
    const raw = p.slice(1).trim()
    const params = raw.length
      ? raw
          .split(/[\s,]+/)
          .map(s => parseFloat(s))
          .filter(n => !Number.isNaN(n))
      : []
    ret.push({ cmd, params })
  }
  return ret
}

/**
 * 二次贝塞尔曲线采样（Q 或 T）
 */
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
    pts.push({ x, y, z: DEFAULT_CONFIG.defaultZ })
  }
  return pts
}

/**
 * 三次贝塞尔曲线采样（C 或 S）
 */
function sampleCubic(
  p0: TLDrawPoint,
  p1: TLDrawPoint,
  p2: TLDrawPoint,
  p3: TLDrawPoint,
  segments: number
): TLDrawPoint[] {
  const pts: TLDrawPoint[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const u = 1 - t
    const x =
      u * u * u * p0.x +
      3 * u * u * t * p1.x +
      3 * u * t * t * p2.x +
      t * t * t * p3.x
    const y =
      u * u * u * p0.y +
      3 * u * u * t * p1.y +
      3 * u * t * t * p2.y +
      t * t * t * p3.y
    pts.push({ x, y, z: DEFAULT_CONFIG.defaultZ })
  }
  return pts
}

/**
 * 改进版 A (arc) 命令采样
 * 基于 SVG arc -> center parameterization 的实现（较精确）
 */
function sampleArc(
  start: TLDrawPoint,
  rx: number,
  ry: number,
  xAxisRotation: number,
  largeArcFlag: number,
  sweepFlag: number,
  end: TLDrawPoint,
  segments: number
): TLDrawPoint[] {
  const φ = (xAxisRotation * Math.PI) / 180
  const x1 = start.x
  const y1 = start.y
  const x2 = end.x
  const y2 = end.y

  // Step 1: 转换到单位圆坐标系
  const dx2 = (x1 - x2) / 2
  const dy2 = (y1 - y2) / 2
  const x1p = Math.cos(φ) * dx2 + Math.sin(φ) * dy2
  const y1p = -Math.sin(φ) * dx2 + Math.cos(φ) * dy2

  // 确保 rx, ry 为正
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  if (rx === 0 || ry === 0) {
    // 退化为直线
    const arr: TLDrawPoint[] = []
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      arr.push({
        x: x1 + (x2 - x1) * t,
        y: y1 + (y2 - y1) * t,
        z: DEFAULT_CONFIG.defaultZ,
      })
    }
    return arr
  }

  // Step 2: 矫正半径，如果需要
  let rxs = rx * rx
  let rys = ry * ry
  const x1ps = x1p * x1p
  const y1ps = y1p * y1p
  let λ = x1ps / rxs + y1ps / rys
  if (λ > 1) {
    const s = Math.sqrt(λ)
    rx *= s
    ry *= s
    rxs = rx * rx
    rys = ry * ry
  }

  // Step 3: 计算中心（cx', cy'）
  const sign = largeArcFlag !== sweepFlag ? 1 : -1
  const sq = Math.max(0, (rxs * rys - rxs * y1ps - rys * x1ps) / (rxs * y1ps + rys * x1ps))
  const coef = sign * Math.sqrt(sq)
  const cxp = (coef * rx * y1p) / ry
  const cyp = (-coef * ry * x1p) / rx

  // Step 4: 转回原坐标系得到中心 (cx, cy)
  const cx = Math.cos(φ) * cxp - Math.sin(φ) * cyp + (x1 + x2) / 2
  const cy = Math.sin(φ) * cxp + Math.cos(φ) * cyp + (y1 + y2) / 2

  // Step 5: 计算角度起点和跨度
  const vectorAngle = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy
    const det = ux * vy - uy * vx
    return Math.atan2(det, dot)
  }

  const ux = (x1p - cxp) / rx
  const uy = (y1p - cyp) / ry
  const vx = (-x1p - cxp) / rx
  const vy = (-y1p - cyp) / ry

  let θ1 = vectorAngle(1, 0, ux, uy)
  let Δθ = vectorAngle(ux, uy, vx, vy)

  if (!sweepFlag && Δθ > 0) Δθ -= 2 * Math.PI
  if (sweepFlag && Δθ < 0) Δθ += 2 * Math.PI

  // Step 6: 采样
  const pts: TLDrawPoint[] = []
  for (let i = 0; i <= segments; i++) {
    const t = θ1 + (Δθ * i) / segments
    const cosT = Math.cos(t)
    const sinT = Math.sin(t)
    const x = Math.cos(φ) * rx * cosT - Math.sin(φ) * ry * sinT + cx
    const y = Math.sin(φ) * rx * cosT + Math.cos(φ) * ry * sinT + cy
    pts.push({ x, y, z: DEFAULT_CONFIG.defaultZ })
  }
  return pts
}

/**
 * 计算多边形签名面积（可用于判断方向）
 * 返回 signed area（不除以2，符号表明方向）
 * area > 0 => CCW (counter-clockwise)
 * area < 0 => CW (clockwise)
 */
function signedPolygonArea(points: TLDrawPoint[]): number {
  let area = 0
  const n = points.length
  if (n < 3) return 0
  for (let i = 0; i < n; i++) {
    const p1 = points[i]
    const p2 = points[(i + 1) % n]
    area += p1.x * p2.y - p2.x * p1.y
  }
  return area / 2
}

/**
 * 主解析函数：把路径 d 转为 多个 TLDrawSegment（按子路径分段）
 * - 对 C/Q/T/S/A 等命令进行密集采样
 * - 返回每个子路径（closed/open），并附带方向信息 (cw/ccw/open)
 */
export function reverseSvgPathToSegments(
  d: string,
  options?: { bezierSegments?: number; arcSegments?: number }
): TLDrawSegment[] {
  if (!d) return []

  // 合并默认选项
  const cfg = {
    bezierSegments: options?.bezierSegments ?? DEFAULT_CONFIG.bezierSegments,
    arcSegments: options?.arcSegments ?? DEFAULT_CONFIG.arcSegments,
  }

  // 规范路径字符串并 token 化
  const cleaned = sanitizeSvgPath(d)
  const commands = tokenizePath(cleaned)

  // 现在我们按子路径（subpath）收集点
  const segmentsRaw: { points: TLDrawPoint[]; closed: boolean }[] = []
  let currentSubpath: TLDrawPoint[] = []
  let current: TLDrawPoint = { x: 0, y: 0, z: DEFAULT_CONFIG.defaultZ }
  let startOfSubpath: TLDrawPoint | null = null
  let prevControl: TLDrawPoint | null = null // 用于 T/S 的平滑控制点

  // helper: 确保至少有一个子路径在 push 点前存在
  const ensureSubpath = () => {
    if (!currentSubpath) currentSubpath = []
  }

  for (const cmdObj of commands) {
    const cmd = cmdObj.cmd.toUpperCase()
    const p = cmdObj.params

    switch (cmd) {
      case 'M': {
        // 如果当前已有一个未关闭的子路径，则把它作为 open 子路径存储
        if (currentSubpath.length > 0) {
          segmentsRaw.push({ points: currentSubpath, closed: false })
          currentSubpath = []
        }
        // M 可能带多个点（M x y x y ...）
        for (let i = 0; i + 1 < p.length; i += 2) {
          const nx = p[i]
          const ny = p[i + 1]
          current = { x: nx, y: ny, z: DEFAULT_CONFIG.defaultZ }
          ensureSubpath()
          currentSubpath.push(current)
          // 第一个 M 设置子路径起点
          if (!startOfSubpath) startOfSubpath = { ...current }
        }
        prevControl = null
        break
      }

      case 'L': {
        ensureSubpath()
        for (let i = 0; i + 1 < p.length; i += 2) {
          const nx = p[i]
          const ny = p[i + 1]
          current = { x: nx, y: ny, z: DEFAULT_CONFIG.defaultZ }
          currentSubpath.push(current)
        }
        prevControl = null
        break
      }

      case 'H': {
        ensureSubpath()
        for (let i = 0; i < p.length; i++) {
          const nx = p[i]
          const ny = current.y
          current = { x: nx, y: ny, z: DEFAULT_CONFIG.defaultZ }
          currentSubpath.push(current)
        }
        prevControl = null
        break
      }

      case 'V': {
        ensureSubpath()
        for (let i = 0; i < p.length; i++) {
          const nx = current.x
          const ny = p[i]
          current = { x: nx, y: ny, z: DEFAULT_CONFIG.defaultZ }
          currentSubpath.push(current)
        }
        prevControl = null
        break
      }

      case 'Z': {
        // 闭合路径：如果有起点并且与当前点不相同，则添加起点（以保证闭合）
        if (startOfSubpath) {
          if (current.x !== startOfSubpath.x || current.y !== startOfSubpath.y) {
            current = { x: startOfSubpath.x, y: startOfSubpath.y, z: DEFAULT_CONFIG.defaultZ }
            ensureSubpath()
            currentSubpath.push(current)
          }
        }
        // 标记为 closed 并 push
        if (currentSubpath.length > 0) {
          segmentsRaw.push({ points: currentSubpath, closed: true })
          currentSubpath = []
        }
        prevControl = null
        startOfSubpath = null
        break
      }

      case 'Q': {
        ensureSubpath()
        for (let i = 0; i + 3 < p.length; i += 4) {
          const control = { x: p[i], y: p[i + 1], z: DEFAULT_CONFIG.defaultZ }
          const end = { x: p[i + 2], y: p[i + 3], z: DEFAULT_CONFIG.defaultZ }
          const sampled = sampleQuadratic(current, control, end, cfg.bezierSegments)
          // sampled 中第一个点通常等于 current，避免重复
          sampled.forEach((pt, idx) => {
            const last = currentSubpath[currentSubpath.length - 1]
            if (!last || last.x !== pt.x || last.y !== pt.y) currentSubpath.push(pt)
          })
          current = end
          prevControl = control
        }
        break
      }

      case 'T': {
        ensureSubpath()
        for (let i = 0; i + 1 < p.length; i += 2) {
          const end = { x: p[i], y: p[i + 1], z: DEFAULT_CONFIG.defaultZ }
          if (!prevControl) {
            // 无 previous control 时，退化为直线
            currentSubpath.push(end)
          } else {
            const control: TLDrawPoint = {
            x: 2 * current.x - prevControl.x,
            y: 2 * current.y - prevControl.y,
            z: DEFAULT_CONFIG.defaultZ,
          }
            const sampled = sampleQuadratic(current, control, end, cfg.bezierSegments)
            sampled.forEach(pt => {
              const last = currentSubpath[currentSubpath.length - 1]
              if (!last || last.x !== pt.x || last.y !== pt.y) currentSubpath.push(pt)
            })
            prevControl = control
          }
          current = end
        }
        break
      }

      case 'C': {
        ensureSubpath()
        for (let i = 0; i + 5 < p.length; i += 6) {
          const c1 = { x: p[i], y: p[i + 1], z: DEFAULT_CONFIG.defaultZ }
          const c2 = { x: p[i + 2], y: p[i + 3], z: DEFAULT_CONFIG.defaultZ }
          const end = { x: p[i + 4], y: p[i + 5], z: DEFAULT_CONFIG.defaultZ }
          const sampled = sampleCubic(current, c1, c2, end, cfg.bezierSegments)
          sampled.forEach(pt => {
            const last = currentSubpath[currentSubpath.length - 1]
            if (!last || last.x !== pt.x || last.y !== pt.y) currentSubpath.push(pt)
          })
          current = end
          prevControl = c2
        }
        break
      }

      case 'S': {
        ensureSubpath()
        for (let i = 0; i + 3 < p.length; i += 4) {
          const c2 = { x: p[i], y: p[i + 1], z: DEFAULT_CONFIG.defaultZ }
          const end = { x: p[i + 2], y: p[i + 3], z: DEFAULT_CONFIG.defaultZ }
          const c1 = prevControl ? { x: 2 * current.x - prevControl.x, y: 2 * current.y - prevControl.y, z: DEFAULT_CONFIG.defaultZ } : { ...current }
          const sampled = sampleCubic(current, c1, c2, end, cfg.bezierSegments)
          sampled.forEach(pt => {
            const last = currentSubpath[currentSubpath.length - 1]
            if (!last || last.x !== pt.x || last.y !== pt.y) currentSubpath.push(pt)
          })
          current = end
          prevControl = c2
        }
        break
      }

      case 'A': {
        ensureSubpath()
        for (let i = 0; i + 6 < p.length; i += 7) {
          const rx = p[i]
          const ry = p[i + 1]
          const xAxisRotation = p[i + 2]
          const largeArcFlag = p[i + 3] ? 1 : 0
          const sweepFlag = p[i + 4] ? 1 : 0
          const end = { x: p[i + 5], y: p[i + 6], z: DEFAULT_CONFIG.defaultZ }
          const sampled = sampleArc(current, rx, ry, xAxisRotation, largeArcFlag, sweepFlag, end, cfg.arcSegments)
          sampled.forEach(pt => {
            const last = currentSubpath[currentSubpath.length - 1]
            if (!last || last.x !== pt.x || last.y !== pt.y) currentSubpath.push(pt)
          })
          current = end
          prevControl = null
        }
        break
      }

      default: {
        // 非常规命令或未知命令：尝试把参数按 (x y) 一对一处理
        ensureSubpath()
        for (let i = 0; i + 1 < p.length; i += 2) {
          const nx = p[i]
          const ny = p[i + 1]
          const pt = { x: nx, y: ny, z: DEFAULT_CONFIG.defaultZ }
          const last = currentSubpath[currentSubpath.length - 1]
          if (!last || last.x !== pt.x || last.y !== pt.y) currentSubpath.push(pt)
          current = pt
        }
        prevControl = null
        break
      }
    } // end switch
  } // end for commands

  // 如果最后还有未 push 的子路径，把它当作 open 子路径加入
  if (currentSubpath.length > 0) {
    segmentsRaw.push({ points: currentSubpath, closed: false })
    currentSubpath = []
  }

  // 清理：去除连续重复点并且丢掉太短的段
  const cleanedSegments = segmentsRaw.map(s => {
    const pts = s.points.filter((p, i) => {
      if (i === 0) return true
      const prev = s.points[i - 1]
      return !(p.x === prev.x && p.y === prev.y)
    })
    return { points: pts, closed: s.closed }
  }).filter(s => s.points.length > 0)

  if (cleanedSegments.length === 0) return []

  // 对闭合子路径计算面积（signed area），用于判断方向
  // 启发式规则：面积绝对值最大的闭合子路径视为外轮廓 -> 强制为 CW（顺时针）
  // 其他闭合子路径视为洞 -> 强制为 CCW（逆时针）
  const closedIndices: number[] = []
  cleanedSegments.forEach((s, idx) => {
    if (s.closed) closedIndices.push(idx)
  })

  if (closedIndices.length > 0) {
    // 计算每个闭合子路径的绝对面积
    const areas = closedIndices.map(idx => ({ idx, area: Math.abs(signedPolygonArea(cleanedSegments[idx].points)) }))
    // 找到最大面积索引（外轮廓）
    areas.sort((a, b) => b.area - a.area)
    const outerIdx = areas[0].idx

    // 强制调整方向：outer -> CW (area < 0), others -> CCW (area > 0)
    for (const idx of closedIndices) {
      const s = cleanedSegments[idx]
      const area = signedPolygonArea(s.points)
      if (idx === outerIdx) {
        // outer: 强制 CW
        if (area > 0) {
          s.points.reverse()
        }
      } else {
        // hole: 强制 CCW
        if (area < 0) {
          s.points.reverse()
        }
      }
    }
  }

  // 最终组装 TLDrawSegment[] 并附带一些辅助信息（closed, direction）
  const result: TLDrawSegment[] = cleanedSegments.map(s => {
    const seg: TLDrawSegment = {
      type: 'free',
      points: s.points.map(pt => ({ x: pt.x, y: pt.y, z: pt.z })),
    }
    return seg
  })

  return result
}
