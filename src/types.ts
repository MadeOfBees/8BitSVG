/** A single cell is either a hex color string (e.g. "#ff0044") or null = transparent. */
export type Cell = string | null

/** Flat composite surface — used by svg.ts and compose.ts output only. Application code uses FrameData. */
export interface Grid {
  width: number
  height: number
  cells: Cell[]
}

export interface LayerMeta {
  id: string
  name: string
  visible: boolean
  opacity: number   // 0–255
  blendMode: number // 0 = Normal
}

export interface LayerEntry {
  meta: LayerMeta
  cells: Cell[]     // flat row-major, length = width * height
}

/** One animation frame: a stack of layers (index 0 = bottom). */
export interface FrameData {
  width: number
  height: number
  layers: LayerEntry[]
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
  frames: FrameData[]
  activeFrame: number
  activeLayer: number
  swatches: string[]
  foregroundColor: string
  backgroundColor: string
}

export const SIZE_PRESETS = [8, 16, 32, 64, 128, 256] as const
