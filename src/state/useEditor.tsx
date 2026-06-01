import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react'
import type { Cell, Grid, Project, Tool } from '../types'
import { createGrid, floodFill, getCell, setCell } from '../lib/grid'
import { loadProject, saveProject } from '../lib/storage'

const MAX_HISTORY = 100
const DEFAULT_SIZE = 16
const DEFAULT_COLOR = '#111827'
const DEFAULT_SWATCHES = [
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
  | { type: 'CLEAR' }

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
      const present = floodFill(state.present, action.x, action.y, action.color)
      return present === state.present ? state : { ...state, present }
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

    case 'SET_ZOOM':
      return { ...state, zoom: Math.min(40, Math.max(2, action.zoom)) }

    case 'ZOOM_BY':
      return { ...state, zoom: Math.min(40, Math.max(2, state.zoom + action.delta)) }

    case 'UNDO': {
      if (!state.past.length) return state
      const present = state.past[state.past.length - 1]
      return {
        ...state,
        past: state.past.slice(0, -1),
        present,
        future: [state.present, ...state.future],
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
      }
    }

    case 'NEW_CANVAS':
      return {
        ...state,
        past: [],
        future: [],
        present: createGrid(action.size, action.size),
      }

    case 'CLEAR':
      return {
        ...state,
        past: pushPast(state.past, state.present),
        future: [],
        present: createGrid(state.present.width, state.present.height),
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
