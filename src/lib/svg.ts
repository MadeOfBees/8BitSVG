import type { Bounds, Grid } from '../types'
import { filledArray, getCell } from './grid'

/**
 * Convert 0-255 alpha to a 0-1 SVG opacity string.
 * Uses integer math (no toFixed) so it transpiles cleanly to Lua via tstl.
 */
function fmtOpacity(a: number): string {
  const p = Math.round(a * 1000 / 255)
  if (p >= 1000) return '1'
  if (p <= 0) return '0'
  const s = p < 10 ? '00' + p : p < 100 ? '0' + p : '' + p
  let i = 3
  while (i > 1 && s[i - 1] === '0') i--
  return '0.' + s.slice(0, i)
}

/**
 * Escape characters that are unsafe inside an XML attribute value.
 * Written without regex so it transpiles cleanly to Lua (see aseprite-ext).
 */
function escapeAttr(value: string): string {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === '&') out += '&amp;'
    else if (ch === '"') out += '&quot;'
    else if (ch === '<') out += '&lt;'
    else out += ch
  }
  return out
}

/**
 * Validate that a string is a legal JavaScript identifier, falling back to a
 * safe default. Regex-free so it transpiles cleanly to Lua.
 */
function safeIdentifier(name: string, fallback: string): string {
  const isAlpha = (c: string): boolean =>
    (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$'
  if (name.length === 0 || !isAlpha(name[0])) return fallback
  for (let i = 1; i < name.length; i++) {
    const c = name[i]
    if (!isAlpha(c) && !(c >= '0' && c <= '9')) return fallback
  }
  return name
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
  color: string
}

/**
 * Greedy-mesh the painted cells inside `bounds` into the fewest rectangles.
 * Coordinates in the returned rects are local to the crop (origin at bounds.x/y).
 */
export function greedyMesh(grid: Grid, bounds: Bounds): Rect[] {
  const { x: ox, y: oy, width: w, height: h } = bounds
  const visited = filledArray<boolean>(w * h, false)
  const rects: Rect[] = []
  const at = (lx: number, ly: number) => getCell(grid, ox + lx, oy + ly)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      if (visited[idx]) continue
      const color = at(x, y)
      if (color === null) {
        visited[idx] = true
        continue
      }

      // Extend right while same color and unvisited.
      let rw = 1
      while (x + rw < w && !visited[y * w + x + rw] && at(x + rw, y) === color) {
        rw++
      }

      // Extend down while every cell in the [x, x+rw) span matches.
      // (Flag instead of a labeled break so this transpiles to Lua.)
      let rh = 1
      let canExtendDown = true
      while (canExtendDown && y + rh < h) {
        for (let k = 0; k < rw; k++) {
          if (visited[(y + rh) * w + x + k] || at(x + k, y + rh) !== color) {
            canExtendDown = false
            break
          }
        }
        if (canExtendDown) rh++
      }

      for (let dy = 0; dy < rh; dy++) {
        for (let dx = 0; dx < rw; dx++) {
          visited[(y + dy) * w + x + dx] = true
        }
      }
      rects.push({ x, y, width: rw, height: rh, color })
    }
  }
  return rects
}

export interface SvgOptions {
  /** Pixels per cell used for the SVG's intrinsic width/height. Default 16. */
  scale?: number
}

interface ColorGroup {
  color: string
  rects: Rect[]
}

/**
 * Group an array of rects by color, preserving order of first occurrence.
 * Uses a plain index object rather than a Map so it transpiles cleanly to Lua.
 */
function groupByColor(rects: Rect[]): ColorGroup[] {
  const groups: ColorGroup[] = []
  const indexByColor: Record<string, number> = {}
  for (const r of rects) {
    const at: number | undefined = indexByColor[r.color]
    if (at === undefined) {
      indexByColor[r.color] = groups.length
      groups.push({ color: r.color, rects: [r] })
    } else {
      groups[at].rects.push(r)
    }
  }
  return groups
}

/** Build a standalone SVG string with a transparent background. */
export function toSvgString(
  grid: Grid,
  bounds: Bounds,
  opts: SvgOptions = {},
): string {
  const scale = opts.scale ?? 16
  const rects = greedyMesh(grid, bounds)
  const groups = groupByColor(rects)
  const lines: string[] = []
  for (const grp of groups) {
    const color = grp.color
    const group = grp.rects
    const hasAlpha = color.length === 9
    const fillRgb = hasAlpha ? color.slice(0, 7) : color
    const opacityAttr = hasAlpha ? ` fill-opacity="${fmtOpacity(parseInt(color.slice(7, 9), 16))}"` : ''
    if (group.length === 1) {
      const r = group[0]
      lines.push(`  <rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${escapeAttr(fillRgb)}"${opacityAttr}/>`)
    } else {
      lines.push(`  <g fill="${escapeAttr(fillRgb)}"${opacityAttr}>`)
      for (const r of group) {
        lines.push(`    <rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}"/>`)
      }
      lines.push(`  </g>`)
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width * scale}" height="${bounds.height * scale}" viewBox="0 0 ${bounds.width} ${bounds.height}" shape-rendering="crispEdges">`,
    ...lines,
    `</svg>`,
  ].join('\n')
}

/** Wrap the artwork as a copy-pasteable React (TSX) component. */
export function toReactComponent(
  grid: Grid,
  bounds: Bounds,
  componentName = 'PixelArt',
): string {
  const safeName = safeIdentifier(componentName, 'PixelArt')
  const rects = greedyMesh(grid, bounds)
  const groups = groupByColor(rects)
  const bodyLines: string[] = []
  for (const grp of groups) {
    const color = grp.color
    const group = grp.rects
    const hasAlpha = color.length === 9
    const fillRgb = hasAlpha ? color.slice(0, 7) : color
    const opacityProp = hasAlpha ? ` fillOpacity={${fmtOpacity(parseInt(color.slice(7, 9), 16))}}` : ''
    if (group.length === 1) {
      const r = group[0]
      bodyLines.push(`      <rect x={${r.x}} y={${r.y}} width={${r.width}} height={${r.height}} fill="${escapeAttr(fillRgb)}"${opacityProp} />`)
    } else {
      bodyLines.push(`      <g fill="${escapeAttr(fillRgb)}"${opacityProp}>`)
      for (const r of group) {
        bodyLines.push(`        <rect x={${r.x}} y={${r.y}} width={${r.width}} height={${r.height}} />`)
      }
      bodyLines.push(`      </g>`)
    }
  }
  return [
    `import type { SVGProps } from 'react'`,
    ``,
    `export function ${safeName}(props: SVGProps<SVGSVGElement>) {`,
    `  return (`,
    `    <svg`,
    `      xmlns="http://www.w3.org/2000/svg"`,
    `      viewBox="0 0 ${bounds.width} ${bounds.height}"`,
    `      shapeRendering="crispEdges"`,
    `      {...props}`,
    `    >`,
    ...bodyLines,
    `    </svg>`,
    `  )`,
    `}`,
  ].join('\n')
}
