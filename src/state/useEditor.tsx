import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react'
import type { Bounds, Cell, FrameData, Grid, LayerEntry, LayerMeta, Project, Tool } from '../types'
import { filledArray, extractRegion, floodFill, getCell, pasteRegion, setCell } from '../lib/grid'
import { compositeFrame } from '../lib/compose'
import { loadProject, saveProject } from '../lib/storage'

const MAX_HISTORY = 100
const MAX_SWATCHES = 64
const DEFAULT_SIZE = 16
const DEFAULT_COLOR = '#000000'
const DEFAULT_SWATCHES = [
  '#000000',
  '#111827',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#ffffff',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMeta(name: string, index: number): LayerMeta {
  return { id: `${Date.now()}-${index}`, name, visible: true, opacity: 255, blendMode: 0 }
}

function makeFrame(width: number, height: number, metas?: LayerMeta[]): FrameData {
  const n = width * height
  const ms = metas ?? [makeMeta('Layer 1', 0)]
  return { width, height, layers: ms.map(meta => ({ meta, cells: filledArray(n, null) })) }
}

function wrapGrid(grid: Grid): FrameData {
  return { width: grid.width, height: grid.height, layers: [{ meta: makeMeta('Layer 1', 0), cells: grid.cells.slice() }] }
}

// ── History ───────────────────────────────────────────────────────────────────

interface HistoryEntry {
  frames: FrameData[]
  activeFrame: number
  activeLayer: number
}

export interface State {
  past: HistoryEntry[]
  frames: FrameData[]
  activeFrame: number
  activeLayer: number
  future: HistoryEntry[]
  tool: Tool
  foregroundColor: string
  backgroundColor: string
  swatches: string[]
  zoom: number
  selection: Bounds | null
  clipboard: { cells: Cell[]; width: number; height: number } | null
}

export type Action =
  | { type: 'BEGIN_STROKE' }
  | { type: 'END_STROKE' }
  | { type: 'PAINT_CELL'; x: number; y: number; color: Cell }
  | { type: 'FLOOD_FILL'; x: number; y: number; color: Cell }
  | { type: 'SET_TOOL'; tool: Tool }
  | { type: 'SET_COLOR'; color: string }
  | { type: 'SET_BACKGROUND_COLOR'; color: string }
  | { type: 'SWAP_COLORS' }
  | { type: 'RESET_COLORS' }
  | { type: 'ADD_SWATCH'; color: string }
  | { type: 'REMOVE_SWATCH'; color: string }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'ZOOM_BY'; delta: number }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'NEW_CANVAS'; size: number }
  | { type: 'LOAD_GRID'; grid: Grid }
  | { type: 'LOAD_FRAMES'; frames: FrameData[] }
  | { type: 'TRANSFORM_GRID'; frame: FrameData }
  | { type: 'SET_SELECTION'; rect: Bounds | null }
  | { type: 'COPY_SELECTION' }
  | { type: 'PASTE_CLIPBOARD' }
  | { type: 'CLEAR' }
  | { type: 'CLEAR_ALL' }
  | { type: 'DELETE_SELECTION' }
  | { type: 'LOAD_SWATCHES'; swatches: string[] }
  | { type: 'ADD_FRAME' }
  | { type: 'REMOVE_FRAME'; index: number }
  | { type: 'DUPLICATE_FRAME' }
  | { type: 'SET_ACTIVE_FRAME'; index: number }
  | { type: 'ADD_LAYER' }
  | { type: 'REMOVE_LAYER' }
  | { type: 'SET_ACTIVE_LAYER'; index: number }
  | { type: 'TOGGLE_LAYER_VISIBILITY'; index: number }
  | { type: 'RENAME_LAYER'; index: number; name: string }
  | { type: 'REORDER_LAYER'; from: number; to: number }
  | { type: 'SET_LAYER_OPACITY'; index: number; opacity: number }
  | { type: 'DUPLICATE_LAYER' }
  | { type: 'MERGE_DOWN' }
  | { type: 'FLATTEN_LAYERS' }

function pushPast(past: HistoryEntry[], frames: FrameData[], activeFrame: number, activeLayer: number): HistoryEntry[] {
  const next = [...past, { frames, activeFrame, activeLayer }]
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
}

function replaceActiveLayer(state: State, newCells: Cell[]): State {
  const frame = state.frames[state.activeFrame]
  const layers = frame.layers.slice()
  layers[state.activeLayer] = { ...layers[state.activeLayer], cells: newCells }
  const frames = state.frames.slice()
  frames[state.activeFrame] = { ...frame, layers }
  return { ...state, frames }
}

// eslint-disable-next-line react-refresh/only-export-components
export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'BEGIN_STROKE':
      return { ...state, past: pushPast(state.past, state.frames, state.activeFrame, state.activeLayer), future: [] }

    case 'END_STROKE': {
      if (state.past.length === 0) return state
      const last = state.past[state.past.length - 1]
      // If the stroke produced no pixel changes, discard the spurious BEGIN_STROKE history entry.
      if (last.frames === state.frames) {
        return { ...state, past: state.past.slice(0, -1) }
      }
      return state
    }

    case 'PAINT_CELL': {
      const frame = state.frames[state.activeFrame]
      const layer = frame.layers[state.activeLayer]
      const layerGrid = { width: frame.width, height: frame.height, cells: layer.cells }
      const updated = setCell(layerGrid, action.x, action.y, action.color)
      if (updated.cells === layer.cells) return state
      return replaceActiveLayer(state, updated.cells)
    }

    case 'FLOOD_FILL': {
      const frame = state.frames[state.activeFrame]
      const layer = frame.layers[state.activeLayer]
      const layerGrid = { width: frame.width, height: frame.height, cells: layer.cells }
      const filled = floodFill(layerGrid, action.x, action.y, action.color)
      if (filled === layerGrid) return state
      let cells = filled.cells
      if (state.selection) {
        // floodFill() has no knowledge of selections; flood the full layer first, then restore
        // any cell that falls outside the selection rect back to its original value.
        cells = cells.slice()
        const { x, y, width, height } = state.selection
        for (let cy = 0; cy < frame.height; cy++) {
          for (let cx = 0; cx < frame.width; cx++) {
            if (cx < x || cx >= x + width || cy < y || cy >= y + height) {
              cells[cy * frame.width + cx] = layer.cells[cy * frame.width + cx]
            }
          }
        }
      }
      return replaceActiveLayer(state, cells)
    }

    case 'SET_TOOL':
      return { ...state, tool: action.tool }

    case 'SET_COLOR':
      return { ...state, foregroundColor: action.color }

    case 'SET_BACKGROUND_COLOR':
      return { ...state, backgroundColor: action.color }

    case 'SWAP_COLORS':
      return { ...state, foregroundColor: state.backgroundColor, backgroundColor: state.foregroundColor }

    case 'RESET_COLORS':
      return { ...state, foregroundColor: '#000000', backgroundColor: '#ffffff' }

    case 'ADD_SWATCH':
      return state.swatches.includes(action.color) || state.swatches.length >= MAX_SWATCHES
        ? state
        : { ...state, swatches: [...state.swatches, action.color] }

    case 'REMOVE_SWATCH':
      return { ...state, swatches: state.swatches.filter((c) => c !== action.color) }

    case 'LOAD_SWATCHES':
      return { ...state, swatches: action.swatches }

    case 'SET_ZOOM':
      return { ...state, zoom: Math.min(256, Math.max(2, action.zoom)) }

    case 'ZOOM_BY':
      return { ...state, zoom: Math.min(256, Math.max(2, state.zoom + action.delta)) }

    case 'UNDO': {
      if (!state.past.length) return state
      const entry = state.past[state.past.length - 1]
      const current = state.frames[state.activeFrame]
      const restored = entry.frames[entry.activeFrame] ?? entry.frames[0]
      return {
        ...state,
        past: state.past.slice(0, -1),
        frames: entry.frames,
        activeFrame: entry.activeFrame,
        activeLayer: Math.min(entry.activeLayer, (entry.frames[entry.activeFrame]?.layers.length ?? 1) - 1),
        future: [{ frames: state.frames, activeFrame: state.activeFrame, activeLayer: state.activeLayer }, ...state.future],
        // Drop the selection when canvas dimensions change — the rect may be out of bounds in the restored state.
        selection:
          restored.width !== current.width || restored.height !== current.height ? null : state.selection,
      }
    }

    case 'REDO': {
      if (!state.future.length) return state
      const entry = state.future[0]
      const current = state.frames[state.activeFrame]
      const restored = entry.frames[entry.activeFrame] ?? entry.frames[0]
      return {
        ...state,
        past: pushPast(state.past, state.frames, state.activeFrame, state.activeLayer),
        frames: entry.frames,
        activeFrame: entry.activeFrame,
        activeLayer: Math.min(entry.activeLayer, (entry.frames[entry.activeFrame]?.layers.length ?? 1) - 1),
        future: state.future.slice(1),
        // Drop the selection when canvas dimensions change — the rect may be out of bounds in the restored state.
        selection:
          restored.width !== current.width || restored.height !== current.height ? null : state.selection,
      }
    }

    case 'NEW_CANVAS':
      return {
        ...state,
        past: [],
        future: [],
        frames: [makeFrame(action.size, action.size)],
        activeFrame: 0,
        activeLayer: 0,
        selection: null,
        clipboard: null,
      }

    case 'LOAD_GRID':
      return {
        ...state,
        past: [],
        future: [],
        frames: [wrapGrid(action.grid)],
        activeFrame: 0,
        activeLayer: 0,
        selection: null,
        clipboard: null,
      }

    case 'LOAD_FRAMES':
      return {
        ...state,
        past: [],
        future: [],
        frames: action.frames,
        activeFrame: 0,
        activeLayer: 0,
        selection: null,
        clipboard: null,
      }

    case 'TRANSFORM_GRID': {
      const frames = state.frames.slice()
      frames[state.activeFrame] = action.frame
      const newLayerCount = action.frame.layers.length
      return {
        ...state,
        past: pushPast(state.past, state.frames, state.activeFrame, state.activeLayer),
        future: [],
        frames,
        activeLayer: Math.min(state.activeLayer, newLayerCount - 1),
        selection: null,
      }
    }

    case 'SET_SELECTION':
      return { ...state, selection: action.rect }

    case 'COPY_SELECTION': {
      if (!state.selection) return state
      const frame = state.frames[state.activeFrame]
      const layer = frame.layers[state.activeLayer]
      const layerGrid = { width: frame.width, height: frame.height, cells: layer.cells }
      const cells = extractRegion(layerGrid, state.selection)
      return { ...state, clipboard: { cells, width: state.selection.width, height: state.selection.height } }
    }

    case 'PASTE_CLIPBOARD': {
      if (!state.clipboard) return state
      const { cells, width, height } = state.clipboard
      const frame = state.frames[state.activeFrame]
      // Paste at the selection origin when active; otherwise center the clipboard in the frame.
      const x = state.selection?.x ?? Math.max(0, Math.min(Math.floor((frame.width - width) / 2), frame.width - 1))
      const y = state.selection?.y ?? Math.max(0, Math.min(Math.floor((frame.height - height) / 2), frame.height - 1))
      const layer = frame.layers[state.activeLayer]
      const layerGrid = { width: frame.width, height: frame.height, cells: layer.cells }
      const newGrid = pasteRegion(layerGrid, cells, x, y, width, height)
      const selW = Math.max(1, Math.min(width, frame.width - x))
      const selH = Math.max(1, Math.min(height, frame.height - y))
      return {
        ...replaceActiveLayer(state, newGrid.cells),
        past: pushPast(state.past, state.frames, state.activeFrame, state.activeLayer),
        future: [],
        selection: { x, y, width: selW, height: selH },
      }
    }

    case 'CLEAR': {
      const frame = state.frames[state.activeFrame]
      const newCells = filledArray(frame.width * frame.height, null)
      return {
        ...replaceActiveLayer(state, newCells),
        past: pushPast(state.past, state.frames, state.activeFrame, state.activeLayer),
        future: [],
      }
    }

    case 'CLEAR_ALL': {
      const frame = state.frames[state.activeFrame]
      return {
        ...state,
        past: pushPast(state.past, state.frames, state.activeFrame, state.activeLayer),
        future: [],
        frames: [makeFrame(frame.width, frame.height)],
        activeFrame: 0,
        activeLayer: 0,
        selection: null,
        clipboard: null,
      }
    }

    case 'DELETE_SELECTION': {
      if (!state.selection) return state
      const { x, y, width, height } = state.selection
      const frame = state.frames[state.activeFrame]
      const layer = frame.layers[state.activeLayer]
      const cells = layer.cells.slice()
      for (let cy = y; cy < y + height; cy++) {
        for (let cx = x; cx < x + width; cx++) {
          cells[cy * frame.width + cx] = null
        }
      }
      return {
        ...replaceActiveLayer(state, cells),
        past: pushPast(state.past, state.frames, state.activeFrame, state.activeLayer),
        future: [],
      }
    }

    case 'ADD_FRAME': {
      const frame = state.frames[state.activeFrame]
      const metas = frame.layers.map(l => l.meta)
      const newFrame = makeFrame(frame.width, frame.height, metas)
      const frames = [
        ...state.frames.slice(0, state.activeFrame + 1),
        newFrame,
        ...state.frames.slice(state.activeFrame + 1),
      ]
      return {
        ...state,
        past: pushPast(state.past, state.frames, state.activeFrame, state.activeLayer),
        future: [],
        frames,
        activeFrame: state.activeFrame + 1,
      }
    }

    case 'REMOVE_FRAME': {
      if (state.frames.length <= 1) return state
      const frames = state.frames.filter((_, i) => i !== action.index)
      const activeFrame = Math.min(state.activeFrame, frames.length - 1)
      return {
        ...state,
        past: pushPast(state.past, state.frames, state.activeFrame, state.activeLayer),
        future: [],
        frames,
        activeFrame,
      }
    }

    case 'DUPLICATE_FRAME': {
      const src = state.frames[state.activeFrame]
      const copy: FrameData = {
        ...src,
        layers: src.layers.map(l => ({ ...l, cells: l.cells.slice() })),
      }
      const frames = [
        ...state.frames.slice(0, state.activeFrame + 1),
        copy,
        ...state.frames.slice(state.activeFrame + 1),
      ]
      return {
        ...state,
        past: pushPast(state.past, state.frames, state.activeFrame, state.activeLayer),
        future: [],
        frames,
        activeFrame: state.activeFrame + 1,
      }
    }

    case 'SET_ACTIVE_FRAME':
      return {
        ...state,
        activeFrame: Math.max(0, Math.min(action.index, state.frames.length - 1)),
      }

    // ── Layer actions ─────────────────────────────────────────────────────────

    case 'ADD_LAYER': {
      const frame = state.frames[state.activeFrame]
      const newIndex = state.activeLayer + 1
      const meta = makeMeta(`Layer ${frame.layers.length + 1}`, frame.layers.length)
      const newLayer: LayerEntry = { meta, cells: filledArray(frame.width * frame.height, null) }
      const layers = [
        ...frame.layers.slice(0, newIndex),
        newLayer,
        ...frame.layers.slice(newIndex),
      ]
      const frames = state.frames.slice()
      frames[state.activeFrame] = { ...frame, layers }
      return {
        ...state,
        past: pushPast(state.past, state.frames, state.activeFrame, state.activeLayer),
        future: [],
        frames,
        activeLayer: newIndex,
      }
    }

    case 'REMOVE_LAYER': {
      const frame = state.frames[state.activeFrame]
      if (frame.layers.length <= 1) return state
      const layers = frame.layers.filter((_, i) => i !== state.activeLayer)
      const frames = state.frames.slice()
      frames[state.activeFrame] = { ...frame, layers }
      return {
        ...state,
        past: pushPast(state.past, state.frames, state.activeFrame, state.activeLayer),
        future: [],
        frames,
        activeLayer: Math.min(state.activeLayer, layers.length - 1),
      }
    }

    case 'SET_ACTIVE_LAYER':
      return {
        ...state,
        activeLayer: Math.max(0, Math.min(action.index, state.frames[state.activeFrame].layers.length - 1)),
      }

    case 'TOGGLE_LAYER_VISIBILITY': {
      const frame = state.frames[state.activeFrame]
      const layers = frame.layers.map((l, i) =>
        i === action.index ? { ...l, meta: { ...l.meta, visible: !l.meta.visible } } : l
      )
      const frames = state.frames.slice()
      frames[state.activeFrame] = { ...frame, layers }
      return { ...state, frames }
    }

    case 'RENAME_LAYER': {
      const frame = state.frames[state.activeFrame]
      const layers = frame.layers.map((l, i) =>
        i === action.index ? { ...l, meta: { ...l.meta, name: action.name } } : l
      )
      const frames = state.frames.slice()
      frames[state.activeFrame] = { ...frame, layers }
      return { ...state, frames }
    }

    case 'REORDER_LAYER': {
      const frame = state.frames[state.activeFrame]
      const { from, to } = action
      if (from === to || from < 0 || to < 0 || from >= frame.layers.length || to >= frame.layers.length) return state
      const layers = frame.layers.slice()
      const [moved] = layers.splice(from, 1)
      layers.splice(to, 0, moved)
      const frames = state.frames.slice()
      frames[state.activeFrame] = { ...frame, layers }
      return {
        ...state,
        past: pushPast(state.past, state.frames, state.activeFrame, state.activeLayer),
        future: [],
        frames,
        activeLayer: to,
      }
    }

    case 'SET_LAYER_OPACITY': {
      const frame = state.frames[state.activeFrame]
      const layers = frame.layers.map((l, i) =>
        i === action.index ? { ...l, meta: { ...l.meta, opacity: Math.max(0, Math.min(255, action.opacity)) } } : l
      )
      const frames = state.frames.slice()
      frames[state.activeFrame] = { ...frame, layers }
      return { ...state, frames }
    }

    case 'DUPLICATE_LAYER': {
      const frame = state.frames[state.activeFrame]
      const src = frame.layers[state.activeLayer]
      const newMeta = makeMeta(`${src.meta.name} copy`, frame.layers.length)
      const newLayer: LayerEntry = { meta: newMeta, cells: src.cells.slice() }
      const newIndex = state.activeLayer + 1
      const layers = [
        ...frame.layers.slice(0, newIndex),
        newLayer,
        ...frame.layers.slice(newIndex),
      ]
      const frames = state.frames.slice()
      frames[state.activeFrame] = { ...frame, layers }
      return {
        ...state,
        past: pushPast(state.past, state.frames, state.activeFrame, state.activeLayer),
        future: [],
        frames,
        activeLayer: newIndex,
      }
    }

    case 'MERGE_DOWN': {
      const frame = state.frames[state.activeFrame]
      if (state.activeLayer <= 0) return state
      const upper = frame.layers[state.activeLayer]
      const lower = frame.layers[state.activeLayer - 1]
      // Composite both layers regardless of visibility, respecting their opacities
      const synth: FrameData = {
        width: frame.width,
        height: frame.height,
        layers: [
          { ...lower, meta: { ...lower.meta, visible: true } },
          { ...upper, meta: { ...upper.meta, visible: true } },
        ],
      }
      const merged = compositeFrame(synth)
      const mergedLayer: LayerEntry = {
        // visible if either source was — a hidden lower + visible upper should remain visible after merge.
        meta: { ...lower.meta, opacity: 255, visible: upper.meta.visible || lower.meta.visible },
        cells: merged.cells,
      }
      const layers = [
        ...frame.layers.slice(0, state.activeLayer - 1),
        mergedLayer,
        ...frame.layers.slice(state.activeLayer + 1),
      ]
      const frames = state.frames.slice()
      frames[state.activeFrame] = { ...frame, layers }
      return {
        ...state,
        past: pushPast(state.past, state.frames, state.activeFrame, state.activeLayer),
        future: [],
        frames,
        activeLayer: state.activeLayer - 1,
      }
    }

    case 'FLATTEN_LAYERS': {
      const frame = state.frames[state.activeFrame]
      if (frame.layers.length <= 1) return state
      const composited = compositeFrame(frame)
      // Result keeps the bottom layer's name; opacity and blendMode reset because per-layer values
      // are already baked into the composited pixels, and there's no layer below to blend with.
      const mergedLayer: LayerEntry = {
        meta: { ...frame.layers[0].meta, opacity: 255, blendMode: 0 },
        cells: composited.cells,
      }
      const frames = state.frames.slice()
      frames[state.activeFrame] = { ...frame, layers: [mergedLayer] }
      return {
        ...state,
        past: pushPast(state.past, state.frames, state.activeFrame, state.activeLayer),
        future: [],
        frames,
        activeLayer: 0,
      }
    }

    default:
      return state
  }
}

function init(): State {
  const saved = loadProject()
  return {
    past: [],
    frames: saved?.frames ?? [makeFrame(DEFAULT_SIZE, DEFAULT_SIZE)],
    activeFrame: saved?.activeFrame ?? 0,
    activeLayer: saved?.activeLayer ?? 0,
    future: [],
    tool: 'pencil',
    foregroundColor: saved?.foregroundColor ?? DEFAULT_COLOR,
    backgroundColor: saved?.backgroundColor ?? '#ffffff',
    swatches: saved?.swatches ?? DEFAULT_SWATCHES,
    zoom: 16,
    selection: null,
    clipboard: null,
  }
}

interface EditorContextValue extends State {
  /** Composited view of the active frame — flat Grid for canvas/svg rendering. */
  present: Grid
  /** Layers of the active frame. */
  layers: LayerEntry[]
  dispatch: React.Dispatch<Action>
  canUndo: boolean
  canRedo: boolean
  /** Apply the active tool at a cell. Handles eyedropper + auto-swatch. */
  applyTool: (x: number, y: number) => void
}

const EditorContext = createContext<EditorContextValue | null>(null)

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init)

  useEffect(() => {
    const project: Project = {
      frames: state.frames,
      activeFrame: state.activeFrame,
      activeLayer: state.activeLayer,
      swatches: state.swatches,
      foregroundColor: state.foregroundColor,
      backgroundColor: state.backgroundColor,
    }
    saveProject(project)
  }, [state.frames, state.activeFrame, state.activeLayer, state.swatches, state.foregroundColor, state.backgroundColor])

  // Recompute the composited view only when the active frame's pixel data changes — not on
  // tool, color, or zoom updates, which don't affect what's rendered on the canvas.
  const activeFrameData = state.frames[state.activeFrame]
  const present = useMemo(() => compositeFrame(activeFrameData), [activeFrameData])

  const value = useMemo<EditorContextValue>(() => {
    const applyTool = (x: number, y: number) => {
      const sel = state.selection
      if (sel && (state.tool === 'pencil' || state.tool === 'eraser' || state.tool === 'fill')) {
        if (x < sel.x || x >= sel.x + sel.width || y < sel.y || y >= sel.y + sel.height) return
      }
      switch (state.tool) {
        case 'pencil':
          dispatch({ type: 'PAINT_CELL', x, y, color: state.foregroundColor })
          break
        case 'eraser':
          dispatch({ type: 'PAINT_CELL', x, y, color: null })
          break
        case 'fill':
          dispatch({ type: 'FLOOD_FILL', x, y, color: state.foregroundColor })
          break
        case 'eyedropper': {
          const c = getCell(present, x, y)
          if (c) {
            dispatch({ type: 'SET_COLOR', color: c })
            dispatch({ type: 'ADD_SWATCH', color: c })
          }
          break
        }
      }
    }

    return {
      ...state,
      present,
      layers: activeFrameData.layers,
      dispatch,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      applyTool,
    }
  }, [state, present])

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext)
  if (!ctx) throw new Error('useEditor must be used within an EditorProvider')
  return ctx
}
