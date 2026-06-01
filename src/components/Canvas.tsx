import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor } from '../state/useEditor'

const CHECKER = 8 // px per checkerboard square
const CHECKER_LIGHT = '#cdcdd3'
const CHECKER_DARK = '#bcbcc4'
const GRID_LINE = 'rgba(0,0,0,0.08)'

export function Canvas() {
  const { present, zoom, tool, applyTool, dispatch } = useEditor()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const drawing = useRef(false)
  const lastCell = useRef<{ x: number; y: number } | null>(null)

  // Positional offset of the grid on the mat (the Move tool drags this).
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  const pxW = present.width * zoom
  const pxH = present.height * zoom

  // Render the grid whenever it, or the zoom, changes.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    // Checkerboard backdrop (signals transparency).
    for (let y = 0; y < pxH; y += CHECKER) {
      for (let x = 0; x < pxW; x += CHECKER) {
        ctx.fillStyle =
          ((x / CHECKER) + (y / CHECKER)) % 2 === 0 ? CHECKER_DARK : CHECKER_LIGHT
        ctx.fillRect(x, y, CHECKER, CHECKER)
      }
    }

    // Painted cells.
    for (let cy = 0; cy < present.height; cy++) {
      for (let cx = 0; cx < present.width; cx++) {
        const color = present.cells[cy * present.width + cx]
        if (color) {
          ctx.fillStyle = color
          ctx.fillRect(cx * zoom, cy * zoom, zoom, zoom)
        }
      }
    }

    // Grid lines (only when cells are large enough to be useful).
    if (zoom >= 8) {
      ctx.strokeStyle = GRID_LINE
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = 0; x <= present.width; x++) {
        ctx.moveTo(x * zoom + 0.5, 0)
        ctx.lineTo(x * zoom + 0.5, pxH)
      }
      for (let y = 0; y <= present.height; y++) {
        ctx.moveTo(0, y * zoom + 0.5)
        ctx.lineTo(pxW, y * zoom + 0.5)
      }
      ctx.stroke()
    }
  }, [present, zoom, pxW, pxH])

  // Wheel-to-zoom anywhere in the workspace (canvas + surrounding mat).
  // Attached natively (not via React's onWheel) so preventDefault works —
  // React registers wheel as passive.
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      dispatch({ type: 'ZOOM_BY', delta: e.deltaY < 0 ? 1 : -1 })
    }
    wrapper.addEventListener('wheel', onWheel, { passive: false })
    return () => wrapper.removeEventListener('wheel', onWheel)
  }, [dispatch])

  // Arrow keys nudge the grid around the mat (one cell per press), the same
  // thing the Move tool does — available regardless of the active tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      ) {
        return
      }
      let dx = 0
      let dy = 0
      switch (e.key) {
        case 'ArrowLeft':
          dx = -1
          break
        case 'ArrowRight':
          dx = 1
          break
        case 'ArrowUp':
          dy = -1
          break
        case 'ArrowDown':
          dy = 1
          break
        default:
          return
      }
      e.preventDefault()
      setOffset((o) => ({ x: o.x + dx * zoom, y: o.y + dy * zoom }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom])

  const cellFromEvent = useCallback(
    (e: React.PointerEvent): { x: number; y: number } | null => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * present.width)
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * present.height)
      if (x < 0 || y < 0 || x >= present.width || y >= present.height) return null
      return { x, y }
    },
    [present.width, present.height],
  )

  // Bresenham line so fast drags don't leave gaps between sampled points.
  const stroke = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number }) => {
      let { x: x0, y: y0 } = from
      const { x: x1, y: y1 } = to
      const dx = Math.abs(x1 - x0)
      const dy = -Math.abs(y1 - y0)
      const sx = x0 < x1 ? 1 : -1
      const sy = y0 < y1 ? 1 : -1
      let err = dx + dy
      for (;;) {
        applyTool(x0, y0)
        if (x0 === x1 && y0 === y1) break
        const e2 = 2 * err
        if (e2 >= dy) {
          err += dy
          x0 += sx
        }
        if (e2 <= dx) {
          err += dx
          y0 += sy
        }
      }
    },
    [applyTool],
  )

  // The Move tool drags the whole grid around the mat. Driven by window-level
  // listeners (not React's onPointerMove + pointer capture) so it keeps
  // tracking wherever the cursor goes, even off the canvas.
  const startMove = (e: React.PointerEvent) => {
    const startX = e.clientX
    const startY = e.clientY
    const origin = offset

    const onMove = (ev: PointerEvent) => {
      setOffset({
        x: origin.x + (ev.clientX - startX),
        y: origin.y + (ev.clientY - startY),
      })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (tool === 'move') {
      startMove(e)
      return
    }

    const cell = cellFromEvent(e)
    if (!cell) return
    e.currentTarget.setPointerCapture(e.pointerId)

    if (tool === 'eyedropper') {
      applyTool(cell.x, cell.y)
      return
    }

    dispatch({ type: 'BEGIN_STROKE' })
    applyTool(cell.x, cell.y)

    if (tool === 'pencil' || tool === 'eraser') {
      drawing.current = true
      lastCell.current = cell
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const cell = cellFromEvent(e)
    if (!cell) return
    if (lastCell.current) stroke(lastCell.current, cell)
    else applyTool(cell.x, cell.y)
    lastCell.current = cell
  }

  const endStroke = () => {
    drawing.current = false
    lastCell.current = null
  }

  const cursor =
    tool === 'move'
      ? 'grab'
      : tool === 'eyedropper'
        ? 'crosshair'
        : tool === 'fill'
          ? 'cell'
          : 'crosshair'

  return (
    <div
      ref={wrapperRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      className="flex h-full w-full touch-none items-center justify-center overflow-auto p-8"
      style={{ cursor }}
    >
      <canvas
        ref={canvasRef}
        width={pxW}
        height={pxH}
        className="shadow-2xl ring-1 ring-black/20"
        style={{
          imageRendering: 'pixelated',
          transform: `translate(${offset.x}px, ${offset.y}px)`,
        }}
      />
    </div>
  )
}
