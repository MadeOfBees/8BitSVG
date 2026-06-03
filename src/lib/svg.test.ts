import { describe, expect, it } from 'vitest'
import { greedyMesh, toReactComponent, toSvgString } from './svg'
import type { Bounds, Grid } from '../types'

const R = '#ff0000'
const B = '#0000ff'

/** Build a grid from rows. 'R'/'B' map to colors, '.' = transparent. */
function gridFrom(rows: string[]): Grid {
  const map: Record<string, string | null> = { R, B, '.': null }
  const height = rows.length
  const width = rows[0].length
  const cells = rows.flatMap((row) => row.split('').map((ch) => map[ch]))
  return { width, height, cells }
}

const full = (g: Grid): Bounds => ({ x: 0, y: 0, width: g.width, height: g.height })

describe('greedyMesh', () => {
  it('merges a solid same-color block into one rect', () => {
    const g = gridFrom(['RR', 'RR'])
    const rects = greedyMesh(g, full(g))
    expect(rects).toEqual([{ x: 0, y: 0, width: 2, height: 2, color: R }])
  })

  it('omits transparent cells entirely', () => {
    const g = gridFrom(['R.', '..'])
    const rects = greedyMesh(g, full(g))
    expect(rects).toEqual([{ x: 0, y: 0, width: 1, height: 1, color: R }])
  })

  it('covers every painted cell exactly once with no overlap', () => {
    const g = gridFrom([
      'RRB',
      'RBB',
      'RRR',
    ])
    const rects = greedyMesh(g, full(g))
    const seen = new Set<string>()
    let painted = 0
    for (const r of rects) {
      for (let y = r.y; y < r.y + r.height; y++) {
        for (let x = r.x; x < r.x + r.width; x++) {
          const key = `${x},${y}`
          expect(seen.has(key)).toBe(false) // no overlap
          seen.add(key)
          // rect color must match the underlying cell
          expect(g.cells[y * g.width + x]).toBe(r.color)
          painted++
        }
      }
    }
    expect(painted).toBe(9) // all cells painted, all covered
  })

  it('respects the crop bounds', () => {
    const g = gridFrom([
      'RR',
      'RR',
    ])
    const rects = greedyMesh(g, { x: 1, y: 0, width: 1, height: 2 })
    // Only the right column, in local (crop-relative) coordinates.
    expect(rects).toEqual([{ x: 0, y: 0, width: 1, height: 2, color: R }])
  })
})

describe('toSvgString', () => {
  it('uses the crop size as the viewBox and emits no background', () => {
    const g = gridFrom(['R.', '.R'])
    const svg = toSvgString(g, full(g))
    expect(svg).toContain('viewBox="0 0 2 2"')
    expect(svg).toContain('shape-rendering="crispEdges"')
    expect(svg).toContain(`fill="${R}"`)
    // No full-canvas background rect → transparent.
    expect(svg).not.toContain('width="2" height="2" fill')
  })

  it('wraps multiple same-color rects in a <g fill> group', () => {
    // Two separate R cells → two rects of the same color → must be grouped.
    const g = gridFrom(['R.', '.R'])
    const svg = toSvgString(g, full(g))
    expect(svg).toContain(`<g fill="${R}">`)
    // Child rects must not carry their own fill attribute.
    expect(svg).not.toMatch(/<rect[^>]+fill=/)
  })

  it('keeps inline fill for a color that appears only once', () => {
    // Single R cell → one rect → no wrapper (a <g> would add bytes, not save them).
    const g = gridFrom(['R.', '..'])
    const svg = toSvgString(g, full(g))
    expect(svg).not.toContain('<g ')
    expect(svg).toContain(`fill="${R}"`)
  })
})

describe('toReactComponent', () => {
  it('produces a typed, prop-spreading component', () => {
    const g = gridFrom(['RR', 'RR'])
    const out = toReactComponent(g, full(g), 'MyArt')
    expect(out).toContain('export function MyArt(props: SVGProps<SVGSVGElement>)')
    expect(out).toContain('shapeRendering="crispEdges"')
    expect(out).toContain('{...props}')
    expect(out).toContain(`<rect x={0} y={0} width={2} height={2} fill="${R}" />`)
  })
})
