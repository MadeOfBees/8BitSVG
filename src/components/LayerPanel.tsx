import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor } from '../state/useEditor'
import type { LayerEntry } from '../types'

const THUMB = 28

const LayerThumb = memo(function LayerThumb({
  layer, width, height,
}: {
  layer: LayerEntry; width: number; height: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, THUMB, THUMB)
    ctx.globalAlpha = layer.meta.visible ? 1 : 0.3
    const cw = THUMB / width
    const ch = THUMB / height
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const color = layer.cells[y * width + x]
        if (!color) continue
        ctx.fillStyle = color
        ctx.fillRect(Math.floor(x * cw), Math.floor(y * ch), Math.ceil(cw), Math.ceil(ch))
      }
    }
    ctx.globalAlpha = 1
  }, [layer, width, height])

  return (
    <canvas
      ref={canvasRef}
      width={THUMB}
      height={THUMB}
      style={{ imageRendering: 'pixelated', width: THUMB, height: THUMB }}
      className="shrink-0 border border-white/10"
    />
  )
})

export function LayerPanel() {
  const { layers, activeLayer, frames, activeFrame, dispatch } = useEditor()
  const [renaming, setRenaming] = useState<number | null>(null)
  const [draftName, setDraftName] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)
  const { width, height } = frames[activeFrame]

  const commitRename = (index: number) => {
    const name = draftName.trim()
    if (name) dispatch({ type: 'RENAME_LAYER', index, name })
    setRenaming(null)
  }

  // layers[0] is the bottom layer (Aseprite convention); UI shows top-of-stack first.
  const displayOrder = useMemo(
    () => layers.map((_, i) => layers.length - 1 - i),
    [layers.length],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-white/10 bg-neutral-900/80">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pb-1.5 pt-3">
        <span className="text-xs uppercase tracking-wide text-neutral-400">Layers</span>
        <div className="flex gap-1">
          <button
            type="button"
            title="Move layer up"
            disabled={activeLayer >= layers.length - 1}
            onClick={() => dispatch({ type: 'REORDER_LAYER', from: activeLayer, to: activeLayer + 1 })}
            className="px-1.5 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ↑
          </button>
          <button
            type="button"
            title="Move layer down"
            disabled={activeLayer <= 0}
            onClick={() => dispatch({ type: 'REORDER_LAYER', from: activeLayer, to: activeLayer - 1 })}
            className="px-1.5 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ↓
          </button>
          <button
            type="button"
            title="Add layer"
            onClick={() => dispatch({ type: 'ADD_LAYER' })}
            className="px-1.5 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700"
          >
            +
          </button>
          <button
            type="button"
            title="Delete layer"
            disabled={layers.length <= 1}
            onClick={() => dispatch({ type: 'REMOVE_LAYER' })}
            className="px-1.5 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            🗑
          </button>
        </div>
      </div>

      {/* Layer list */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {displayOrder.map((layerIdx) => {
          const layer = layers[layerIdx]
          const isActive = layerIdx === activeLayer

          return (
            <div
              key={layer.meta.id}
              className={`relative flex flex-col px-2 py-2 text-sm transition-colors ${
                isActive ? 'bg-white/10 text-neutral-100' : 'text-neutral-200'
              }`}
            >
              {/* Full-coverage select button sits behind the row controls */}
              <button
                type="button"
                aria-label={`Select layer ${layer.meta.name}`}
                aria-pressed={isActive}
                onClick={() => dispatch({ type: 'SET_ACTIVE_LAYER', index: layerIdx })}
                className="absolute inset-0 cursor-pointer hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/40"
              />
              <div className="relative z-10 flex items-center gap-2">
                {/* Eye toggle */}
                <button
                  type="button"
                  title={layer.meta.visible ? 'Hide layer' : 'Show layer'}
                  onClick={(e) => { e.stopPropagation(); dispatch({ type: 'TOGGLE_LAYER_VISIBILITY', index: layerIdx }) }}
                  className={`text-[13px] leading-none ${layer.meta.visible ? 'opacity-100' : 'opacity-30'}`}
                >
                  👁
                </button>

                {/* Layer thumbnail */}
                <LayerThumb layer={layer} width={width} height={height} />

                {/* Name (double-click to rename) */}
                {renaming === layerIdx ? (
                  <input
                    ref={renameRef}
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={() => commitRename(layerIdx)}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') commitRename(layerIdx)
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 border border-neutral-500 bg-neutral-800 px-1 text-xs outline-none"
                    autoFocus
                  />
                ) : (
                  <span
                    className="flex-1 truncate text-xs"
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      setDraftName(layer.meta.name)
                      setRenaming(layerIdx)
                    }}
                  >
                    {layer.meta.name}
                  </span>
                )}
              </div>

              {/* Opacity slider — only for active layer */}
              {isActive && (
                <div className="mt-1.5 flex items-center gap-2 pl-5">
                  <span className="text-[10px] text-neutral-500">Opacity</span>
                  <input
                    type="range"
                    min={0}
                    max={255}
                    value={layer.meta.opacity}
                    onChange={(e) => dispatch({ type: 'SET_LAYER_OPACITY', index: layerIdx, opacity: parseInt(e.target.value, 10) })}
                    onClick={(e) => e.stopPropagation()}
                    className="h-1 min-w-0 flex-1 cursor-pointer accent-emerald-400"
                  />
                  <span className="w-7 text-right text-[10px] tabular-nums text-neutral-400">
                    {Math.round(layer.meta.opacity / 2.55)}%
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
