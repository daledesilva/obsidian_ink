export interface TLDrawPoint {
  x: number
  y: number
  z?: number
}

export interface TLDrawSegment {
  type: 'free'
  points: TLDrawPoint[]
}

const DEFAULT_CONFIG = {
  bezierSegments: 24,
  arcSegments: 36,
  defaultZ: 0.5,
  // 当控制点到直线距离低于该阈值时，认为该曲线可近似为直线（像素单位）
  linearApproxEpsilon: 0.5,
}

export function sanitizeSvgPath(d: string): string {
  if (!d) return ''
  let path = d
  // 1. 规范逗号与空白
  path = path.replace(/,/g, ' ')
  // 2. 把命令字母和数字之间强制分隔（但保留大小写）
  // 例如: "M10-20" -> "M 10 -20"，同时支持科学计数法和负号连写
  // 首先在命令字母前后插空格
  path = path.replace(/([a-zA-Z])/g, ' $1 ')
  // 然后把可能被粘连的数值（如 10-20 或 3.5e-2-1）分开：在数字和负号之间加空格（但要保留 e- 的情况）
  // 使用一系列替换以尽可能兼容各种压缩格式
  // 插入空格在数字之后紧跟负号或正号（排除指数形式中的 e+ e-）
  path = path.replace(/(\d)([-+])(?![\deE])/g, '$1 $2')
  // 合并多空格
  path = path.replace(/\s+/g, ' ').trim()

  const tokens = path.split(/\s+/)
  const out: string[] = []

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (/^[a-zA-Z]$/.test(t)) {
      // 保留原始大小写（不转大写）
      out.push(t)
    } else {
      // 尝试解析数字（允许科学计数法）
      const num = Number(t)
      const hasGlobalTransform = /transform=/.test(d) || /viewBox=/.test(d)
      if (Math.abs(num) > 10000 && !hasGlobalTransform) {
        // 对于极大坐标做缩放保护（网络 SVG 有时会包含未应用 transform 的高精度坐标）
        const scaleFactor = 0.01
        out.push((num * scaleFactor).toString())
      } else {
        out.push(t)
      }
    }
  }

  return out.join(' ').replace(/\s+/g, ' ').trim()
}

export function tokenizePath(d: string): { cmd: string; params: number[] }[] {
  const ret: { cmd: string; params: number[] }[] = []
  if (!d) return ret
  // 匹配命令字符（大小写）以及后续非命令字符
  const pairs = d.match(/[A-Za-z][^A-Za-z]*/g) || []
  for (const p of pairs) {
    const cmd = p[0] // 保留大小写
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

  const dx2 = (x1 - x2) / 2
  const dy2 = (y1 - y2) / 2
  const x1p = Math.cos(φ) * dx2 + Math.sin(φ) * dy2
  const y1p = -Math.sin(φ) * dx2 + Math.cos(φ) * dy2

  rx = Math.abs(rx)
  ry = Math.abs(ry)
  if (rx === 0 || ry === 0) {
    const arr: TLDrawPoint[] = []
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      arr.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, z: DEFAULT_CONFIG.defaultZ })
    }
    return arr
  }

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

  const sign = largeArcFlag !== sweepFlag ? 1 : -1
  const sq = Math.max(0, (rxs * rys - rxs * y1ps - rys * x1ps) / (rxs * y1ps + rys * x1ps))
  const coef = sign * Math.sqrt(sq)
  const cxp = (coef * rx * y1p) / ry
  const cyp = (-coef * ry * x1p) / rx

  const cx = Math.cos(φ) * cxp - Math.sin(φ) * cyp + (x1 + x2) / 2
  const cy = Math.sin(φ) * cxp + Math.cos(φ) * cyp + (y1 + y2) / 2

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

function distancePointToLine(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const A = px - x1
  const B = py - y1
  const C = x2 - x1
  const D = y2 - y1
  const dot = A * C + B * D
  const len2 = C * C + D * D
  if (len2 === 0) return Math.hypot(px - x1, py - y1)
  const t = dot / len2
  const projx = x1 + C * t
  const projy = y1 + D * t
  return Math.hypot(px - projx, py - projy)
}

export function reverseSvgPathToSegments(
  d: string,
  options?: { bezierSegments?: number; arcSegments?: number }
): TLDrawSegment[] {
  if (!d) return []

  const cfg = {
    bezierSegments: options?.bezierSegments ?? DEFAULT_CONFIG.bezierSegments,
    arcSegments: options?.arcSegments ?? DEFAULT_CONFIG.arcSegments,
  }

  const cleaned = sanitizeSvgPath(d)
  const commands = tokenizePath(cleaned)

  const segmentsRaw: { points: TLDrawPoint[]; closed: boolean }[] = []
  let currentSubpath: TLDrawPoint[] = []
  let current: TLDrawPoint = { x: 0, y: 0, z: DEFAULT_CONFIG.defaultZ }
  let startOfSubpath: TLDrawPoint | null = null
  let prevControl: TLDrawPoint | null = null

  const ensureSubpath = () => {
    if (!currentSubpath) currentSubpath = []
  }

  for (const cmdObj of commands) {
    const rawCmd = cmdObj.cmd
    const isRelative = rawCmd !== rawCmd.toUpperCase()
    const cmd = rawCmd.toUpperCase()
    const p = cmdObj.params

    // 动态 Epsilon 计算，用于直线检测
    const dynamicEpsilon = (() => {
      const coords = p.filter(n => !Number.isNaN(n));
      if (coords.length > 0) {
        const maxCoord = Math.max(...coords.map(Math.abs));
        return Math.max(DEFAULT_CONFIG.linearApproxEpsilon, Math.min(maxCoord * 0.0005, 25));
      }
      return DEFAULT_CONFIG.linearApproxEpsilon;
    })();

    switch (cmd) {
      case 'M': {
        if (currentSubpath.length > 0) {
          segmentsRaw.push({ points: currentSubpath, closed: false })
          currentSubpath = []
        }
        for (let i = 0; i + 1 < p.length; i += 2) {
          const nx = isRelative ? current.x + p[i] : p[i]
          const ny = isRelative ? current.y + p[i + 1] : p[i + 1]
          current = { x: nx, y: ny, z: DEFAULT_CONFIG.defaultZ }
          ensureSubpath()
          currentSubpath.push(current)
          if (!startOfSubpath) startOfSubpath = { ...current }
          // SVG 规范：M/m 后续的坐标对是隐式的 L/l 命令
          if (p.length > 2) {
            cmdObj.cmd = isRelative ? 'l' : 'L';
          }
        }
        prevControl = null
        break
      }

      case 'L': {
        ensureSubpath()
        for (let i = 0; i + 1 < p.length; i += 2) {
          const nx = isRelative ? current.x + p[i] : p[i]
          const ny = isRelative ? current.y + p[i + 1] : p[i + 1]
          current = { x: nx, y: ny, z: DEFAULT_CONFIG.defaultZ }
          currentSubpath.push(current)
        }
        prevControl = null
        break
      }

      case 'H': {
        ensureSubpath()
        for (let i = 0; i < p.length; i++) {
          const nx = isRelative ? current.x + p[i] : p[i]
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
          const ny = isRelative ? current.y + p[i] : p[i]
          current = { x: nx, y: ny, z: DEFAULT_CONFIG.defaultZ }
          currentSubpath.push(current)
        }
        prevControl = null
        break
      }

      case 'Z': {
        if (startOfSubpath) {
          if (current.x !== startOfSubpath.x || current.y !== startOfSubpath.y) {
            current = { x: startOfSubpath.x, y: startOfSubpath.y, z: DEFAULT_CONFIG.defaultZ }
            ensureSubpath()
            currentSubpath.push(current)
          }
        }
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
          const control = { x: isRelative ? current.x + p[i] : p[i], y: isRelative ? current.y + p[i + 1] : p[i + 1], z: DEFAULT_CONFIG.defaultZ }
          const end = { x: isRelative ? current.x + p[i + 2] : p[i + 2], y: isRelative ? current.y + p[i + 3] : p[i + 3], z: DEFAULT_CONFIG.defaultZ }
          const sampled = sampleQuadratic(current, control, end, cfg.bezierSegments)
          sampled.forEach((pt) => {
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
          const end = { x: isRelative ? current.x + p[i] : p[i], y: isRelative ? current.y + p[i + 1] : p[i + 1], z: DEFAULT_CONFIG.defaultZ }
          const control: TLDrawPoint = prevControl ? { x: 2 * current.x - prevControl.x, y: 2 * current.y - prevControl.y, z: DEFAULT_CONFIG.defaultZ } : { ...current }
          const sampled = sampleQuadratic(current, control, end, cfg.bezierSegments)
          sampled.forEach((pt) => {
            const last = currentSubpath[currentSubpath.length - 1]
            if (!last || last.x !== pt.x || last.y !== pt.y) currentSubpath.push(pt)
          })
          current = end
          prevControl = control
        }
        break
      }

      case 'C': {
        ensureSubpath()
        for (let i = 0; i + 5 < p.length; i += 6) {
          const c1 = { x: isRelative ? current.x + p[i] : p[i], y: isRelative ? current.y + p[i + 1] : p[i + 1], z: DEFAULT_CONFIG.defaultZ }
          const c2 = { x: isRelative ? current.x + p[i + 2] : p[i + 2], y: isRelative ? current.y + p[i + 3] : p[i + 3], z: DEFAULT_CONFIG.defaultZ }
          const end = { x: isRelative ? current.x + p[i + 4] : p[i + 4], y: isRelative ? current.y + p[i + 5] : p[i + 5], z: DEFAULT_CONFIG.defaultZ }

          const d1 = distancePointToLine(c1.x, c1.y, current.x, current.y, end.x, end.y)
          const d2 = distancePointToLine(c2.x, c2.y, current.x, current.y, end.x, end.y)
          if (Math.max(d1, d2) <= dynamicEpsilon) {
            currentSubpath.push({ ...end, z: DEFAULT_CONFIG.defaultZ })
          } else {
            const sampled = sampleCubic(current, c1, c2, end, cfg.bezierSegments)
            sampled.forEach((pt) => {
              const last = currentSubpath[currentSubpath.length - 1]
              if (!last || last.x !== pt.x || last.y !== pt.y) currentSubpath.push(pt)
            })
          }
          current = end
          prevControl = c2
        }
        break
      }

      case 'S': {
        ensureSubpath()
        for (let i = 0; i + 3 < p.length; i += 4) {
          const c2 = { x: isRelative ? current.x + p[i] : p[i], y: isRelative ? current.y + p[i + 1] : p[i + 1], z: DEFAULT_CONFIG.defaultZ }
          const end = { x: isRelative ? current.x + p[i + 2] : p[i + 2], y: isRelative ? current.y + p[i + 3] : p[i + 3], z: DEFAULT_CONFIG.defaultZ }
          const c1 = prevControl ? { x: 2 * current.x - prevControl.x, y: 2 * current.y - prevControl.y, z: DEFAULT_CONFIG.defaultZ } : { ...current }

          const d1 = distancePointToLine(c1.x, c1.y, current.x, current.y, end.x, end.y)
          const d2 = distancePointToLine(c2.x, c2.y, current.x, current.y, end.x, end.y)
          if (Math.max(d1, d2) <= dynamicEpsilon) {
            currentSubpath.push({ ...end, z: DEFAULT_CONFIG.defaultZ })
          } else {
            const sampled = sampleCubic(current, c1, c2, end, cfg.bezierSegments)
            sampled.forEach((pt) => {
              const last = currentSubpath[currentSubpath.length - 1]
              if (!last || last.x !== pt.x || last.y !== pt.y) currentSubpath.push(pt)
            })
          }
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
          const largeArcFlag = p[i + 3]
          const sweepFlag = p[i + 4]
          const end = { x: isRelative ? current.x + p[i + 5] : p[i + 5], y: isRelative ? current.y + p[i + 6] : p[i + 6], z: DEFAULT_CONFIG.defaultZ }

          const sampled = sampleArc(current, rx, ry, xAxisRotation, largeArcFlag, sweepFlag, end, cfg.arcSegments)
          sampled.forEach((pt) => {
            const last = currentSubpath[currentSubpath.length - 1]
            if (!last || last.x !== pt.x || last.y !== pt.y) currentSubpath.push(pt)
          })
          current = end
          prevControl = null
        }
        break
      }
    }
  }

  if (currentSubpath.length > 0) {
    segmentsRaw.push({ points: currentSubpath, closed: false })
  }

  const cleanedSegments = segmentsRaw
    .map(s => {
      const pts = s.points.filter((p, i) => {
        if (i === 0) return true
        const prev = s.points[i - 1]
        return !(p.x === prev.x && p.y === prev.y)
      })
      return { points: pts, closed: s.closed }
    })
    .filter(s => s.points.length > 0)

  if (cleanedSegments.length === 0) return []

  const closedIndices: number[] = []
  cleanedSegments.forEach((s, idx) => {
    if (s.closed) closedIndices.push(idx)
  })

  if (closedIndices.length > 0) {
    const areas = closedIndices.map(idx => ({ idx, area: Math.abs(signedPolygonArea(cleanedSegments[idx].points)) }))
    areas.sort((a, b) => b.area - a.area)
    const outerIdx = areas[0].idx

    for (const idx of closedIndices) {
      const s = cleanedSegments[idx]
      const area = signedPolygonArea(s.points)
      if (idx === outerIdx) {
        if (area > 0) {
          s.points.reverse()
        }
      } else {
        if (area < 0) {
          s.points.reverse()
        }
      }
    }
  }

  const result: TLDrawSegment[] = cleanedSegments.map(s => ({ type: 'free', points: s.points.map(pt => ({ x: pt.x, y: pt.y, z: pt.z })) }))

  return result
}