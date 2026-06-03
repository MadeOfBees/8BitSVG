import {
  LuEraser,
  LuMinus,
  LuMove,
  LuPaintBucket,
  LuPencil,
  LuPipette,
  LuPlus,
  LuRedo2,
  LuScan,
  LuUndo2,
} from 'react-icons/lu'
import { useEditor } from '../state/useEditor'
import type { Tool } from '../types'

const TOOLS: { id: Tool; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'pencil', label: 'Pencil (B)', Icon: LuPencil },
  { id: 'eraser', label: 'Eraser (E)', Icon: LuEraser },
  { id: 'fill', label: 'Fill (G)', Icon: LuPaintBucket },
  { id: 'eyedropper', label: 'Pick (I)', Icon: LuPipette },
  { id: 'select', label: 'Select (S)', Icon: LuScan },
  { id: 'move', label: 'Move (V)', Icon: LuMove },
]

export function LeftSidebar() {
  const { tool, dispatch, canUndo, canRedo, zoom } = useEditor()

  return (
    <div className="flex w-12 shrink-0 flex-col border-r border-white/10 bg-neutral-900/80">
      {/* Tools */}
      {TOOLS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          title={label}
          onClick={() => dispatch({ type: 'SET_TOOL', tool: id })}
          className={`flex h-10 w-full items-center justify-center transition ${
            tool === id
              ? 'bg-indigo-500 ring-2 ring-inset ring-indigo-300'
              : 'hover:bg-neutral-700'
          }`}
        >
          <Icon size={16} />
        </button>
      ))}

      <div className="mx-2 border-t border-white/10" />

      {/* Undo / Redo */}
      <button
        type="button"
        title="Undo (Ctrl+Z)"
        disabled={!canUndo}
        onClick={() => dispatch({ type: 'UNDO' })}
        className="flex h-10 w-full items-center justify-center hover:bg-neutral-700 disabled:opacity-30"
      >
        <LuUndo2 size={16} />
      </button>
      <button
        type="button"
        title="Redo (Ctrl+Y)"
        disabled={!canRedo}
        onClick={() => dispatch({ type: 'REDO' })}
        className="flex h-10 w-full items-center justify-center hover:bg-neutral-700 disabled:opacity-30"
      >
        <LuRedo2 size={16} />
      </button>

      <div className="mx-2 border-t border-white/10" />

      {/* Zoom */}
      <button
        type="button"
        title="Zoom in (+)"
        onClick={() => dispatch({ type: 'ZOOM_BY', delta: 2 })}
        className="flex h-8 w-full items-center justify-center hover:bg-neutral-700"
      >
        <LuPlus size={14} />
      </button>
      <span className="py-0.5 text-center text-xs tabular-nums text-neutral-400">
        ×{zoom}
      </span>
      <button
        type="button"
        title="Zoom out (-)"
        onClick={() => dispatch({ type: 'ZOOM_BY', delta: -2 })}
        className="flex h-8 w-full items-center justify-center hover:bg-neutral-700"
      >
        <LuMinus size={14} />
      </button>
    </div>
  )
}
