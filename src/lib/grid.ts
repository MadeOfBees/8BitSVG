import type { Bounds, Cell, Grid } from '../types'

/**
 * Create an array of `n` copies of `value`. Used instead of `new Array(n).fill()`
 * so this module transpiles to Lua (tstl rejects `new Array(length)`).
 */
export function filledArray<T>(n: number, value: T): T[] {
  const a: T[] = []
  for (let i = 0; i < n; i++) a.push(value)
  return a
}

/** Create a blank (fully transparent) grid. */
export function createGrid(width: number, height: number): Grid {
  return { width, height, cells: filledArray<Cell>(width * height, null) }
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
  while (stack.length > 0) {
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

/** Clamp a Bounds rectangle so it stays fully inside a wxh grid (never negative). */
export function clampBounds(b: Bounds, w: number, h: number): Bounds {
  const x = Math.max(0, Math.min(b.x, w - 1))
  const y = Math.max(0, Math.min(b.y, h - 1))
  return {
    x,
    y,
    width: Math.max(0, Math.min(b.width, w - x)),
    height: Math.max(0, Math.min(b.height, h - y)),
  }
}

export function flipHorizontal(grid: Grid): Grid {
  const { width: W, height: H, cells } = grid
  const out: Cell[] = filledArray<Cell>(W * H, null)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      out[y * W + x] = cells[y * W + (W - 1 - x)]
  return { width: W, height: H, cells: out }
}

export function flipVertical(grid: Grid): Grid {
  const { width: W, height: H, cells } = grid
  const out: Cell[] = filledArray<Cell>(W * H, null)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      out[y * W + x] = cells[(H - 1 - y) * W + x]
  return { width: W, height: H, cells: out }
}

// New dimensions after rotation: width = H, height = W
export function rotateCW(grid: Grid): Grid {
  const { width: W, height: H, cells } = grid
  const out: Cell[] = filledArray<Cell>(W * H, null)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      out[x * H + (H - 1 - y)] = cells[y * W + x]
  return { width: H, height: W, cells: out }
}

export function rotateCCW(grid: Grid): Grid {
  const { width: W, height: H, cells } = grid
  const out: Cell[] = filledArray<Cell>(W * H, null)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      out[(W - 1 - x) * H + y] = cells[y * W + x]
  return { width: H, height: W, cells: out }
}

export function rotate180(grid: Grid): Grid {
  const { width: W, height: H, cells } = grid
  const out: Cell[] = filledArray<Cell>(W * H, null)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      out[y * W + x] = cells[(H - 1 - y) * W + (W - 1 - x)]
  return { width: W, height: H, cells: out }
}

export function extractRegion(
  grid: Grid,
  rect: { x: number; y: number; width: number; height: number },
): Cell[] {
  const cells: Cell[] = []
  for (let y = rect.y; y < rect.y + rect.height; y++)
    for (let x = rect.x; x < rect.x + rect.width; x++)
      cells.push(inBounds(grid, x, y) ? grid.cells[y * grid.width + x] : null)
  return cells
}

export function pasteRegion(
  grid: Grid,
  cells: Cell[],
  destX: number,
  destY: number,
  w: number,
  h: number,
): Grid {
  const next = cloneGrid(grid)
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) {
      const gx = destX + dx
      const gy = destY + dy
      if (inBounds(grid, gx, gy)) next.cells[gy * grid.width + gx] = cells[dy * w + dx]
    }
  return next
}

