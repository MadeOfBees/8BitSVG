import { describe, expect, it } from 'vitest'
import {
  contentBounds,
  createGrid,
  floodFill,
  getCell,
  isEmpty,
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
