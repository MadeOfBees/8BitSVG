/** A single cell is either a hex color string (e.g. "#ff0044") or null = transparent. */
export type Cell = string | null

/** The drawing surface: a flat row-major array of `width * height` cells. */
export interface Grid {
  width: number
  height: number
  cells: Cell[]
}

export type Tool = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'move' | 'select'

/** A rectangular region in cell coordinates — used for selections, crop bounds, and content queries. */
export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** Persisted project shape (localStorage). */
export interface Project {
  grid: Grid
  swatches: string[]
  activeColor: string
}

export const SIZE_PRESETS = [8, 16, 32, 64, 128, 256] as const
