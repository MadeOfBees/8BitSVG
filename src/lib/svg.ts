import type { Bounds, Grid } from '../types'
import { getCell } from './grid'

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
  const visited = new Array<boolean>(w * h).fill(false)
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
      let rh = 1
      outer: while (y + rh < h) {
        for (let k = 0; k < rw; k++) {
          if (visited[(y + rh) * w + x + k] || at(x + k, y + rh) !== color) {
            break outer
          }
        }
        rh++
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

/** Build a standalone SVG string with a transparent background. */
export function toSvgString(
  grid: Grid,
  bounds: Bounds,
  opts: SvgOptions = {},
): string {
  const scale = opts.scale ?? 16
  const rects = greedyMesh(grid, bounds)
  const body = rects
    .map(
      (r) =>
        `  <rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${r.color}"/>`,
    )
    .join('\n')
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width * scale}" height="${bounds.height * scale}" viewBox="0 0 ${bounds.width} ${bounds.height}" shape-rendering="crispEdges">`,
    body,
    `</svg>`,
  ].join('\n')
}

/** Wrap the artwork as a copy-pasteable React (TSX) component. */
export function toReactComponent(
  grid: Grid,
  bounds: Bounds,
  componentName = 'PixelArt',
): string {
  const rects = greedyMesh(grid, bounds)
  const body = rects
    .map(
      (r) =>
        `      <rect x={${r.x}} y={${r.y}} width={${r.width}} height={${r.height}} fill="${r.color}" />`,
    )
    .join('\n')
  return [
    `import type { SVGProps } from 'react'`,
    ``,
    `export function ${componentName}(props: SVGProps<SVGSVGElement>) {`,
    `  return (`,
    `    <svg`,
    `      xmlns="http://www.w3.org/2000/svg"`,
    `      viewBox="0 0 ${bounds.width} ${bounds.height}"`,
    `      shapeRendering="crispEdges"`,
    `      {...props}`,
    `    >`,
    body,
    `    </svg>`,
    `  )`,
    `}`,
  ].join('\n')
}
