import type { IconType } from 'react-icons'
import {
  LuEraser,
  LuMinus,
  LuMove,
  LuPaintBucket,
  LuPencil,
  LuPipette,
  LuPlus,
  LuRedo2,
  LuUndo2,
} from 'react-icons/lu'
import { useEditor } from '../state/useEditor'
import { SIZE_PRESETS, type Tool } from '../types'

const TOOLS: { id: Tool; label: string; Icon: IconType }[] = [
  { id: 'pencil', label: 'Pencil (B)', Icon: LuPencil },
  { id: 'eraser', label: 'Eraser (E)', Icon: LuEraser },
  { id: 'fill', label: 'Fill (G)', Icon: LuPaintBucket },
  { id: 'eyedropper', label: 'Pick (I)', Icon: LuPipette },
  { id: 'move', label: 'Move (V)', Icon: LuMove },
]

export function Toolbar({ onExport }: { onExport: () => void }) {
  const { tool, dispatch, canUndo, canRedo, zoom, present } = useEditor()

  const newCanvas = (size: number) => {
    if (
      present.cells.some((c) => c !== null) &&
      !confirm(`Start a new ${size}×${size} canvas? This clears the current drawing.`)
    ) {
      return
    }
    dispatch({ type: 'NEW_CANVAS', size })
  }

  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-white/10 bg-neutral-900/80 px-4 py-3">
      <div className="flex gap-1">
        {TOOLS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            title={label}
            onClick={() => dispatch({ type: 'SET_TOOL', tool: id })}
            className={`flex h-10 w-10 items-center justify-center transition ${
              tool === id
                ? 'bg-indigo-500 ring-2 ring-indigo-300'
                : 'bg-neutral-800 hover:bg-neutral-700'
            }`}
          >
            <Icon size={18} aria-hidden />
          </button>
        ))}
      </div>

      <div className="flex gap-1">
        <button
          type="button"
          title="Undo"
          disabled={!canUndo}
          onClick={() => dispatch({ type: 'UNDO' })}
          className="flex h-10 w-10 items-center justify-center bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30"
        >
          <LuUndo2 size={18} aria-hidden />
        </button>
        <button
          type="button"
          title="Redo"
          disabled={!canRedo}
          onClick={() => dispatch({ type: 'REDO' })}
          className="flex h-10 w-10 items-center justify-center bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30"
        >
          <LuRedo2 size={18} aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-400">Zoom</span>
        <button
          type="button"
          title="Zoom out"
          onClick={() => dispatch({ type: 'SET_ZOOM', zoom: zoom - 2 })}
          className="flex h-8 w-8 items-center justify-center bg-neutral-800 hover:bg-neutral-700"
        >
          <LuMinus size={16} aria-hidden />
        </button>
        <span className="w-7 text-center text-sm tabular-nums">{zoom}</span>
        <button
          type="button"
          title="Zoom in"
          onClick={() => dispatch({ type: 'SET_ZOOM', zoom: zoom + 2 })}
          className="flex h-8 w-8 items-center justify-center bg-neutral-800 hover:bg-neutral-700"
        >
          <LuPlus size={16} aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-400">New</span>
        {SIZE_PRESETS.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => newCanvas(size)}
            className="bg-neutral-800 px-2.5 py-1 text-sm hover:bg-neutral-700"
          >
            {size}²
          </button>
        ))}
      </div>

      <div className="ml-auto flex gap-2">
        <button
          type="button"
          onClick={() => dispatch({ type: 'CLEAR' })}
          className="bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onExport}
          className="bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-400"
        >
          Crop & Export
        </button>
      </div>
    </div>
  )
}
