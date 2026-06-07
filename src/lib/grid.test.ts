import { describe, expect, it } from 'vitest'
import {
  contentBounds,
  createGrid,
  extractRegion,
  flipHorizontal,
  flipVertical,
  floodFill,
  getCell,
  isEmpty,
  pasteRegion,
  rotateCCW,
  rotateCW,
  rotate180,
  setCell,
} from './grid'
import type { Grid } from '../types'

/** Build a grid from rows of single-char tokens ('.' = transparent). */
function gridFrom(rows: string[]): Grid {
  const height = rows.length
  const width = rows[0].length
  const cells = rows.flatMap((row) =>
    row.split('').map((ch) => (ch === '.' ? null : `#${ch}${ch}${ch}${ch}${ch}${ch}`)),
  )
  return { width, height, cells }
}

describe('createGrid', () => {
  it('creates an all-transparent grid of the right size', () => {
    const g = createGrid(3, 2)
    expect(g.width).toBe(3)
    expect(g.height).toBe(2)
    expect(g.cells).toHaveLength(6)
    expect(isEmpty(g)).toBe(true)
  })
})

describe('setCell', () => {
  it('sets a cell immutably and returns a new grid', () => {
    const g = createGrid(2, 2)
    const next = setCell(g, 1, 0, '#ff0000')
    expect(getCell(next, 1, 0)).toBe('#ff0000')
    expect(getCell(g, 1, 0)).toBe(null) // original untouched
    expect(next).not.toBe(g)
  })

  it('returns the same reference when nothing changes', () => {
    const g = createGrid(2, 2)
    expect(setCell(g, 0, 0, null)).toBe(g)
  })

  it('ignores out-of-bounds writes', () => {
    const g = createGrid(2, 2)
    expect(setCell(g, 5, 5, '#fff')).toBe(g)
  })
})

describe('floodFill', () => {
  it('fills a contiguous same-color region only', () => {
    // left half '1', right half '.', a single '1' island bottom-right
    const g = gridFrom([
      '11..',
      '11..',
      '...1',
    ])
    const filled = floodFill(g, 0, 0, '#aaaaaa')
    // The connected left block becomes the new color...
    expect(getCell(filled, 0, 0)).toBe('#aaaaaa')
    expect(getCell(filled, 1, 1)).toBe('#aaaaaa')
    // ...the isolated island is untouched.
    expect(getCell(filled, 3, 2)).toBe('#111111')
  })

  it('is a no-op when target color equals fill color', () => {
    const g = gridFrom(['11', '11'])
    expect(floodFill(g, 0, 0, '#111111')).toBe(g)
  })

  it('can fill transparent regions', () => {
    const g = gridFrom(['1.', '..'])
    const filled = floodFill(g, 1, 0, '#222222')
    expect(getCell(filled, 1, 0)).toBe('#222222')
    expect(getCell(filled, 0, 1)).toBe('#222222')
    expect(getCell(filled, 0, 0)).toBe('#111111') // barrier not crossed
  })
})

describe('contentBounds', () => {
  it('returns null for an empty grid', () => {
    expect(contentBounds(createGrid(4, 4))).toBe(null)
  })

  it('tightly wraps painted cells', () => {
    const g = gridFrom([
      '....',
      '.11.',
      '.1..',
      '....',
    ])
    expect(contentBounds(g)).toEqual({ x: 1, y: 1, width: 2, height: 2 })
  })

  it('handles a single painted cell', () => {
    const g = gridFrom(['..', '.1'])
    expect(contentBounds(g)).toEqual({ x: 1, y: 1, width: 1, height: 1 })
  })
})

// Helpers for transform tests — non-square (3x2) grids to catch axis-swap bugs.
const A = '#aaaaaa'
const B = '#bbbbbb'
const C = '#cccccc'
const D = '#dddddd'
const E = '#eeeeee'
const F = '#ffffff'

/** Make a grid from a flat cells array with explicit dimensions. */
function makeGrid(cells: (string | null)[], w: number, h: number): Grid {
  return { width: w, height: h, cells: [...cells] }
}

describe('flipHorizontal', () => {
  it('mirrors columns on a 3x2 grid', () => {
    // row0=[A,B,C] row1=[D,E,F] → row0=[C,B,A] row1=[F,E,D]
    const g = makeGrid([A, B, C, D, E, F], 3, 2)
    expect(flipHorizontal(g)).toMatchObject({ width: 3, height: 2, cells: [C, B, A, F, E, D] })
  })

  it('is its own inverse', () => {
    const g = makeGrid([A, B, C, D, E, F], 3, 2)
    expect(flipHorizontal(flipHorizontal(g)).cells).toEqual(g.cells)
  })
})

describe('flipVertical', () => {
  it('mirrors rows on a 3x2 grid', () => {
    // row0=[A,B,C] row1=[D,E,F] → row0=[D,E,F] row1=[A,B,C]
    const g = makeGrid([A, B, C, D, E, F], 3, 2)
    expect(flipVertical(g)).toMatchObject({ width: 3, height: 2, cells: [D, E, F, A, B, C] })
  })
})

describe('rotateCW', () => {
  it('swaps dimensions on a 3x2 grid', () => {
    const g = makeGrid([A, B, C, D, E, F], 3, 2)
    const r = rotateCW(g)
    expect(r.width).toBe(2)
    expect(r.height).toBe(3)
  })

  it('produces the correct layout: left column becomes top row', () => {
    // Input 3x2: row0=[A,B,C] row1=[D,E,F]
    // CW → 2x3:  row0=[D,A] row1=[E,B] row2=[F,C]
    const g = makeGrid([A, B, C, D, E, F], 3, 2)
    expect(rotateCW(g).cells).toEqual([D, A, E, B, F, C])
  })
})

describe('rotateCCW', () => {
  it('swaps dimensions', () => {
    const g = makeGrid([A, B, C, D, E, F], 3, 2)
    const r = rotateCCW(g)
    expect(r.width).toBe(2)
    expect(r.height).toBe(3)
  })

  it('is the inverse of rotateCW', () => {
    const g = makeGrid([A, B, C, D, E, F], 3, 2)
    const rt = rotateCCW(rotateCW(g))
    expect(rt.width).toBe(g.width)
    expect(rt.height).toBe(g.height)
    expect(rt.cells).toEqual(g.cells)
  })
})

describe('rotate180', () => {
  it('reverses the cell order (same dimensions)', () => {
    const g = makeGrid([A, B, C, D, E, F], 3, 2)
    const r = rotate180(g)
    expect(r.width).toBe(3)
    expect(r.height).toBe(2)
    expect(r.cells).toEqual([F, E, D, C, B, A])
  })

  it('equals two successive CW rotations', () => {
    const g = makeGrid([A, B, C, D, E, F], 3, 2)
    expect(rotate180(g).cells).toEqual(rotateCW(rotateCW(g)).cells)
  })
})

describe('extractRegion', () => {
  it('extracts a sub-region in row-major order', () => {
    const g = setCell(createGrid(3, 3), 1, 1, '#ff0000')
    // Extract 2x2 starting at (1,1): cells (1,1)=red, (2,1)=null, (1,2)=null, (2,2)=null
    expect(extractRegion(g, { x: 1, y: 1, width: 2, height: 2 })).toEqual([
      '#ff0000', null,
      null,      null,
    ])
  })

  it('pads out-of-bounds coordinates with null', () => {
    const g = createGrid(2, 2)
    // Extract 2x2 starting at (1,1): only (1,1) is in-bounds; (2,*) and (*,2) are OOB
    const cells = extractRegion(g, { x: 1, y: 1, width: 2, height: 2 })
    expect(cells).toHaveLength(4)
    expect(cells).toEqual([null, null, null, null])
  })
})

describe('pasteRegion', () => {
  it('writes cells into the correct position', () => {
    const g = createGrid(3, 3)
    const src = ['#ff0000', '#00ff00', '#0000ff', '#ffffff']
    const result = pasteRegion(g, src, 1, 1, 2, 2)
    expect(getCell(result, 1, 1)).toBe('#ff0000')
    expect(getCell(result, 2, 1)).toBe('#00ff00')
    expect(getCell(result, 1, 2)).toBe('#0000ff')
    expect(getCell(result, 2, 2)).toBe('#ffffff')
    expect(getCell(result, 0, 0)).toBe(null) // untouched
  })

  it('silently skips cells that would land out of bounds', () => {
    const g = createGrid(2, 2)
    // Paste 2x2 at (1,1): only (1,1) is in-bounds
    const result = pasteRegion(g, ['#ff0000', null, null, null], 1, 1, 2, 2)
    expect(getCell(result, 1, 1)).toBe('#ff0000')
    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
  })

  it('does not mutate the original grid', () => {
    const g = createGrid(3, 3)
    pasteRegion(g, ['#ff0000'], 0, 0, 1, 1)
    expect(getCell(g, 0, 0)).toBe(null)
  })
})
