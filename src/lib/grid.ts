import type { Bounds, Cell, Grid } from '../types'

/** Create a blank (fully transparent) grid. */
export function createGrid(width: number, height: number): Grid {
  return { width, height, cells: new Array<Cell>(width * height).fill(null) }
}

/** Shallow-copy a grid with a fresh cells array (safe to mutate for history). */
export function cloneGrid(grid: Grid): Grid {
  return { ...grid, cells: grid.cells.slice() }
}

export function indexOf(grid: Grid, x: number, y: number): number {
  return y * grid.width + x
}

export function inBounds(grid: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height
}

export function getCell(grid: Grid, x: number, y: number): Cell {
  return inBounds(grid, x, y) ? grid.cells[indexOf(grid, x, y)] : null
}

/** Returns a new grid with one cell set, or the same grid if nothing changed. */
export function setCell(grid: Grid, x: number, y: number, color: Cell): Grid {
  if (!inBounds(grid, x, y)) return grid
  const i = indexOf(grid, x, y)
  if (grid.cells[i] === color) return grid
  const next = cloneGrid(grid)
  next.cells[i] = color
  return next
}

/**
 * Flood-fill the contiguous region of cells matching the color at (x, y),
 * replacing them with `color`. 4-connected. Returns a new grid.
 */
export function floodFill(grid: Grid, x: number, y: number, color: Cell): Grid {
  if (!inBounds(grid, x, y)) return grid
  const target = getCell(grid, x, y)
  if (target === color) return grid

  const next = cloneGrid(grid)
  const stack: [number, number][] = [[x, y]]
  while (stack.length) {
    const [cx, cy] = stack.pop()!
    if (!inBounds(grid, cx, cy)) continue
    const i = indexOf(grid, cx, cy)
    if (next.cells[i] !== target) continue
    next.cells[i] = color
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1])
  }
  return next
}

/**
 * Tight bounding box of all painted (non-null) cells, or null if grid is empty.
 */
export function contentBounds(grid: Grid): Bounds | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.cells[indexOf(grid, x, y)] !== null) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

export function isEmpty(grid: Grid): boolean {
  return grid.cells.every((c) => c === null)
}
