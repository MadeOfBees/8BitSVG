import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react'
import type { Bounds, Cell, Grid, Project, Tool } from '../types'
import { createGrid, extractRegion, floodFill, getCell, pasteRegion, setCell } from '../lib/grid'
import { loadProject, saveProject } from '../lib/storage'

const MAX_HISTORY = 100
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

interface State {
  past: Grid[]
  present: Grid
  future: Grid[]
  tool: Tool
  activeColor: string
  swatches: string[]
  zoom: number
  selection: Bounds | null
  clipboard: { cells: Cell[]; width: number; height: number } | null
}

type Action =
  | { type: 'BEGIN_STROKE' }
  | { type: 'PAINT_CELL'; x: number; y: number; color: Cell }
  | { type: 'FLOOD_FILL'; x: number; y: number; color: Cell }
  | { type: 'SET_TOOL'; tool: Tool }
  | { type: 'SET_COLOR'; color: string }
  | { type: 'ADD_SWATCH'; color: string }
  | { type: 'REMOVE_SWATCH'; color: string }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'ZOOM_BY'; delta: number }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'NEW_CANVAS'; size: number }
  | { type: 'LOAD_GRID'; grid: Grid }
  | { type: 'TRANSFORM_GRID'; grid: Grid }
  | { type: 'SET_SELECTION'; rect: Bounds | null }
  | { type: 'COPY_SELECTION' }
  | { type: 'PASTE_CLIPBOARD' }
  | { type: 'CLEAR' }
  | { type: 'DELETE_SELECTION' }
  | { type: 'LOAD_SWATCHES'; swatches: string[] }

function pushPast(past: Grid[], present: Grid): Grid[] {
  const next = [...past, present]
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'BEGIN_STROKE':
      return { ...state, past: pushPast(state.past, state.present), future: [] }

    case 'PAINT_CELL': {
      const present = setCell(state.present, action.x, action.y, action.color)
      return present === state.present ? state : { ...state, present }
    }

    case 'FLOOD_FILL': {
      const newPresent = floodFill(state.present, action.x, action.y, action.color)
      if (newPresent === state.present) return state
      // If a selection is active, restore any cells changed outside its bounds.
      if (state.selection) {
        const { x, y, width, height } = state.selection
        for (let cy = 0; cy < newPresent.height; cy++) {
          for (let cx = 0; cx < newPresent.width; cx++) {
            if (cx < x || cx >= x + width || cy < y || cy >= y + height) {
              newPresent.cells[cy * newPresent.width + cx] =
                state.present.cells[cy * state.present.width + cx]
            }
          }
        }
      }
      return { ...state, present: newPresent }
    }

    case 'SET_TOOL':
      return { ...state, tool: action.tool }

    case 'SET_COLOR':
      return { ...state, activeColor: action.color }

    case 'ADD_SWATCH':
      return state.swatches.includes(action.color)
        ? state
        : { ...state, swatches: [...state.swatches, action.color] }

    case 'REMOVE_SWATCH':
      return {
        ...state,
        swatches: state.swatches.filter((c) => c !== action.color),
      }

    case 'LOAD_SWATCHES':
      return { ...state, swatches: action.swatches }

    case 'SET_ZOOM':
      return { ...state, zoom: Math.min(256, Math.max(2, action.zoom)) }

    case 'ZOOM_BY':
      return { ...state, zoom: Math.min(256, Math.max(2, state.zoom + action.delta)) }

    case 'UNDO': {
      if (!state.past.length) return state
      const present = state.past[state.past.length - 1]
      return {
        ...state,
        past: state.past.slice(0, -1),
        present,
        future: [state.present, ...state.future],
        // Clear a stale selection whenever the grid dimensions change (e.g. undoing a rotate/crop).
        selection:
          present.width !== state.present.width || present.height !== state.present.height
            ? null
            : state.selection,
      }
    }

    case 'REDO': {
      if (!state.future.length) return state
      const present = state.future[0]
      return {
        ...state,
        past: pushPast(state.past, state.present),
        present,
        future: state.future.slice(1),
        selection:
          present.width !== state.present.width || present.height !== state.present.height
            ? null
            : state.selection,
      }
    }

    case 'NEW_CANVAS':
      return {
        ...state,
        past: [],
        future: [],
        present: createGrid(action.size, action.size),
        selection: null,
        clipboard: null,
      }

    case 'LOAD_GRID':
      return {
        ...state,
        past: [],
        future: [],
        present: action.grid,
        selection: null,
        clipboard: null,
      }

    case 'TRANSFORM_GRID':
      return {
        ...state,
        past: pushPast(state.past, state.present),
        future: [],
        present: action.grid,
        // Always clear selection — TopBar re-sets it via a follow-up SET_SELECTION when needed.
        selection: null,
      }

    case 'SET_SELECTION':
      return { ...state, selection: action.rect }

    case 'COPY_SELECTION': {
      if (!state.selection) return state
      const cells = extractRegion(state.present, state.selection)
      return {
        ...state,
        clipboard: { cells, width: state.selection.width, height: state.selection.height },
      }
    }

    case 'PASTE_CLIPBOARD': {
      if (!state.clipboard) return state
      const { cells, width, height } = state.clipboard
      const x = state.selection?.x ?? 0
      const y = state.selection?.y ?? 0
      const newGrid = pasteRegion(state.present, cells, x, y, width, height)
      // Clamp the resulting selection to canvas bounds so it never overhangs.
      const selW = Math.max(1, Math.min(width, state.present.width - x))
      const selH = Math.max(1, Math.min(height, state.present.height - y))
      return {
        ...state,
        past: pushPast(state.past, state.present),
        future: [],
        present: newGrid,
        selection: { x, y, width: selW, height: selH },
      }
    }

    case 'CLEAR':
      return {
        ...state,
        past: pushPast(state.past, state.present),
        future: [],
        present: createGrid(state.present.width, state.present.height),
        clipboard: null,
      }

    case 'DELETE_SELECTION': {
      if (!state.selection) return state
      const { x, y, width, height } = state.selection
      const cells = state.present.cells.slice()
      for (let cy = y; cy < y + height; cy++) {
        for (let cx = x; cx < x + width; cx++) {
          cells[cy * state.present.width + cx] = null
        }
      }
      return {
        ...state,
        past: pushPast(state.past, state.present),
        future: [],
        present: { ...state.present, cells },
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
    present: saved?.grid ?? createGrid(DEFAULT_SIZE, DEFAULT_SIZE),
    future: [],
    tool: 'pencil',
    activeColor: saved?.activeColor ?? DEFAULT_COLOR,
    swatches: saved?.swatches ?? DEFAULT_SWATCHES,
    zoom: 16,
    selection: null,
    clipboard: null,
  }
}

interface EditorContextValue extends State {
  dispatch: React.Dispatch<Action>
  canUndo: boolean
  canRedo: boolean
  /** Apply the active tool at a cell. Handles eyedropper + auto-swatch. */
  applyTool: (x: number, y: number) => void
}

const EditorContext = createContext<EditorContextValue | null>(null)

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init)

  // Debounced autosave of the persistable slice.
  useEffect(() => {
    const project: Project = {
      grid: state.present,
      swatches: state.swatches,
      activeColor: state.activeColor,
    }
    saveProject(project)
  }, [state.present, state.swatches, state.activeColor])

  const value = useMemo<EditorContextValue>(() => {
    const applyTool = (x: number, y: number) => {
      // When a selection is active, restrict all paint tools to cells within it.
      const sel = state.selection
      if (sel && (state.tool === 'pencil' || state.tool === 'eraser' || state.tool === 'fill')) {
        if (x < sel.x || x >= sel.x + sel.width || y < sel.y || y >= sel.y + sel.height) return
      }
      switch (state.tool) {
        case 'pencil':
          dispatch({ type: 'PAINT_CELL', x, y, color: state.activeColor })
          break
        case 'eraser':
          dispatch({ type: 'PAINT_CELL', x, y, color: null })
          break
        case 'fill':
          dispatch({ type: 'FLOOD_FILL', x, y, color: state.activeColor })
          break
        case 'eyedropper': {
          const c = getCell(state.present, x, y)
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
      dispatch,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      applyTool,
    }
  }, [state])

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
