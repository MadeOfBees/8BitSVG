import { memo, useEffect, useRef } from 'react'
import { useEditor } from '../state/useEditor'
import { compositeFrame } from '../lib/compose'
import type { FrameData } from '../types'

const THUMB_SIZE = 40

const FrameThumb = memo(function FrameThumb({ frame, active }: { frame: FrameData; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE)
    const grid = compositeFrame(frame)
    const cellW = THUMB_SIZE / grid.width
    const cellH = THUMB_SIZE / grid.height
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const color = grid.cells[y * grid.width + x]
        if (!color) continue
        ctx.fillStyle = color
        ctx.fillRect(
          Math.floor(x * cellW),
          Math.floor(y * cellH),
          Math.ceil(cellW),
          Math.ceil(cellH),
        )
      }
    }
  }, [frame])

  return (
    <canvas
      ref={canvasRef}
      width={THUMB_SIZE}
      height={THUMB_SIZE}
      style={{ imageRendering: 'pixelated' }}
      className={`block border ${active ? 'border-neutral-400' : 'border-white/20'}`}
    />
  )
})

export function FrameTimeline() {
  const { frames, activeFrame, dispatch } = useEditor()

  return (
    <div className="flex h-20 shrink-0 items-center gap-3 border-t border-white/10 bg-neutral-900/80 px-4">
      <div
        className="flex flex-1 items-center gap-2 overflow-x-auto"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' && activeFrame > 0)
            dispatch({ type: 'SET_ACTIVE_FRAME', index: activeFrame - 1 })
          else if (e.key === 'ArrowRight' && activeFrame < frames.length - 1)
            dispatch({ type: 'SET_ACTIVE_FRAME', index: activeFrame + 1 })
        }}
      >
        {frames.map((frame, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Frame ${i + 1}`}
            aria-current={i === activeFrame ? 'true' : undefined}
            onClick={() => dispatch({ type: 'SET_ACTIVE_FRAME', index: i })}
            className="flex flex-col items-center gap-0.5 rounded p-1 hover:bg-white/5"
          >
            <FrameThumb frame={frame} active={i === activeFrame} />
            <span className="text-[10px] text-neutral-400">{i + 1}</span>
          </button>
        ))}
      </div>

      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          title="Add frame"
          onClick={() => dispatch({ type: 'ADD_FRAME' })}
          className="bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700"
        >
          +
        </button>
        <button
          type="button"
          title="Duplicate frame"
          onClick={() => dispatch({ type: 'DUPLICATE_FRAME' })}
          className="bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700"
        >
          ⧉
        </button>
        <button
          type="button"
          title="Delete frame"
          disabled={frames.length <= 1}
          onClick={() => dispatch({ type: 'REMOVE_FRAME', index: activeFrame })}
          className="bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          🗑
        </button>
      </div>
    </div>
  )
}
