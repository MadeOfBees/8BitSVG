import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useEditor } from '../state/useEditor'
import type { Bounds } from '../types'

const GRID_LINE = 'rgba(0,0,0,0.08)'

// ABGR uint32 for little-endian ImageData Uint32Array view.
// Formula: (0xFF << 24 | B << 16 | G << 8 | R) >>> 0
const CHECKER_LIGHT_U32 = 0xFFFFFFFF >>> 0  // #ffffff
const CHECKER_DARK_U32  = 0xFFDBD4D4 >>> 0  // #d4d4db

const _colorCache = new Map<string, number>()
function hexToU32(hex: string): number {
  let v = _colorCache.get(hex)
  if (v !== undefined) return v
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  v = (0xFF << 24 | b << 16 | g << 8 | r) >>> 0
  _colorCache.set(hex, v)
  return v
}

export function Canvas() {
  const { present, zoom, tool, applyTool, dispatch, selection } = useEditor()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const pixelCanvasRef = useRef<HTMLCanvasElement>(null)
  const gridCanvasRef  = useRef<HTMLCanvasElement>(null)
  const pixelCtxRef    = useRef<CanvasRenderingContext2D | null>(null)
  const imageDataRef   = useRef<ImageData | null>(null)
  const uint32Ref      = useRef<Uint32Array | null>(null)
  const prevCellsRef   = useRef<(string | null)[]>([])

  const drawing = useRef(false)
  const lastCell = useRef<{ x: number; y: number } | null>(null)
  const selecting = useRef(false)
  const selectStart = useRef<{ x: number; y: number } | null>(null)
  const draftSelRef = useRef<Bounds | null>(null)
  const [draftSel, setDraftSel] = useState<Bounds | null>(null)
  const panTeardownRef = useRef<(() => void) | null>(null)

  const [offset, setOffset] = useState({ x: 0, y: 0 })

  // Stable refs so the wheel handler never captures stale values.
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const offsetRef = useRef(offset)
  offsetRef.current = offset
  const presentSizeRef = useRef({ width: present.width, height: present.height })
  presentSizeRef.current = { width: present.width, height: present.height }

  const pxW = present.width * zoom
  const pxH = present.height * zoom

  // Effect 1: update pixel canvas via ImageData + dirty-rect putImageData.
  // Depends only on `present` — zoom changes require no pixel work.
  useLayoutEffect(() => {
    const canvas = pixelCanvasRef.current
    if (!canvas) return
    const { width: W, height: H, cells } = present

    if (!imageDataRef.current || imageDataRef.current.width !== W || imageDataRef.current.height !== H) {
      imageDataRef.current = new ImageData(W, H)
      uint32Ref.current = new Uint32Array(imageDataRef.current.data.buffer)
      prevCellsRef.current = []
    }
    if (!pixelCtxRef.current) {
      pixelCtxRef.current = canvas.getContext('2d', { alpha: false })!
      pixelCtxRef.current.imageSmoothingEnabled = false
    }

    const buf       = uint32Ref.current!
    const prevCells = prevCellsRef.current
    let minX = W, minY = H, maxX = -1, maxY = -1

    for (let i = 0; i < W * H; i++) {
      const cell = cells[i]
      if (cell === prevCells[i]) continue

      const cx = i % W
      const cy = (i / W) | 0
      buf[i] = cell ? hexToU32(cell) : ((cx + cy) & 1 ? CHECKER_DARK_U32 : CHECKER_LIGHT_U32)

      if (cx < minX) minX = cx
      if (cy < minY) minY = cy
      if (cx > maxX) maxX = cx
      if (cy > maxY) maxY = cy
    }

    prevCellsRef.current = cells
    if (maxX < 0) return

    pixelCtxRef.current!.putImageData(
      imageDataRef.current!, 0, 0,
      minX, minY, maxX - minX + 1, maxY - minY + 1,
    )
  }, [present])

  // Effect 2: redraw grid lines. Only fires on zoom or canvas dimension changes.
  useLayoutEffect(() => {
    const canvas = gridCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, pxW, pxH)
    if (zoom < 8) return

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
  }, [zoom, present.width, present.height, pxW, pxH])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const z = zoomRef.current
      const off = offsetRef.current
      const { width: W, height: H } = presentSizeRef.current
      const delta = e.deltaY < 0 ? 1 : -1
      const newZoom = Math.min(256, Math.max(2, z + delta))
      if (newZoom === z) return

      // Zoom toward cursor: keep the canvas point under the mouse fixed.
      const rect = wrapper.getBoundingClientRect()
      const wrapCx = rect.left + rect.width / 2
      const wrapCy = rect.top + rect.height / 2
      const mouseInCanvasX = e.clientX - wrapCx + (W * z) / 2 - off.x
      const mouseInCanvasY = e.clientY - wrapCy + (H * z) / 2 - off.y
      const scale = newZoom / z

      setOffset({
        x: e.clientX - wrapCx + (W * newZoom) / 2 - mouseInCanvasX * scale,
        y: e.clientY - wrapCy + (H * newZoom) / 2 - mouseInCanvasY * scale,
      })
      dispatch({ type: 'SET_ZOOM', zoom: newZoom })
    }
    wrapper.addEventListener('wheel', onWheel, { passive: false })
    return () => wrapper.removeEventListener('wheel', onWheel)
  }, [dispatch])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      let dx = 0
      let dy = 0
      switch (e.key) {
        case 'ArrowLeft': dx = -1; break
        case 'ArrowRight': dx = 1; break
        case 'ArrowUp': dy = -1; break
        case 'ArrowDown': dy = 1; break
        default: return
      }
      e.preventDefault()
      setOffset((o) => ({ x: o.x + dx * zoom, y: o.y + dy * zoom }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom])

  useEffect(() => {
    return () => { panTeardownRef.current?.() }
  }, [])

  const cellFromEvent = useCallback(
    (e: React.PointerEvent): { x: number; y: number } | null => {
      const canvas = pixelCanvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const x = Math.floor((e.clientX - rect.left) / zoom)
      const y = Math.floor((e.clientY - rect.top) / zoom)
      if (x < 0 || y < 0 || x >= present.width || y >= present.height) return null
      return { x, y }
    },
    [present.width, present.height, zoom],
  )

  const cellClamped = useCallback(
    (e: React.PointerEvent): { x: number; y: number } => {
      const canvas = pixelCanvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      const x = Math.floor((e.clientX - rect.left) / zoom)
      const y = Math.floor((e.clientY - rect.top) / zoom)
      return {
        x: Math.max(0, Math.min(present.width - 1, x)),
        y: Math.max(0, Math.min(present.height - 1, y)),
      }
    },
    [present.width, present.height, zoom],
  )

  const updateDraft = (rect: Bounds | null) => {
    draftSelRef.current = rect
    setDraftSel(rect)
  }

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
        if (e2 >= dy) { err += dy; x0 += sx }
        if (e2 <= dx) { err += dx; y0 += sy }
      }
    },
    [applyTool],
  )

  const startMove = (e: React.PointerEvent) => {
    if (panTeardownRef.current) return
    const startX = e.clientX
    const startY = e.clientY
    const origin = offset

    const onMove = (ev: PointerEvent) => {
      setOffset({ x: origin.x + (ev.clientX - startX), y: origin.y + (ev.clientY - startY) })
    }
    const teardown = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', teardown)
      window.removeEventListener('pointercancel', teardown)
      panTeardownRef.current = null
    }
    panTeardownRef.current = teardown
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', teardown)
    window.addEventListener('pointercancel', teardown)
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 2 || tool === 'move') {
      startMove(e)
      return
    }

    if (tool === 'select') {
      const cell = cellFromEvent(e)
      if (!cell) {
        dispatch({ type: 'SET_SELECTION', rect: null })
        return
      }
      e.currentTarget.setPointerCapture(e.pointerId)
      selecting.current = true
      selectStart.current = cell
      updateDraft({ x: cell.x, y: cell.y, width: 1, height: 1 })
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
    if (selecting.current && selectStart.current) {
      const cell = cellClamped(e)
      const x = Math.min(selectStart.current.x, cell.x)
      const y = Math.min(selectStart.current.y, cell.y)
      const width = Math.abs(cell.x - selectStart.current.x) + 1
      const height = Math.abs(cell.y - selectStart.current.y) + 1
      updateDraft({ x, y, width, height })
      return
    }
    if (!drawing.current) return
    const cell = cellFromEvent(e)
    if (!cell) return
    if (lastCell.current) stroke(lastCell.current, cell)
    else applyTool(cell.x, cell.y)
    lastCell.current = cell
  }

  const endStroke = () => {
    if (selecting.current) {
      if (draftSelRef.current) dispatch({ type: 'SET_SELECTION', rect: draftSelRef.current })
      updateDraft(null)
      selecting.current = false
      selectStart.current = null
      return
    }
    drawing.current = false
    lastCell.current = null
  }

  const rawSel = draftSel ?? selection
  const displaySel = rawSel
    ? {
        x: Math.max(0, Math.min(rawSel.x, present.width - 1)),
        y: Math.max(0, Math.min(rawSel.y, present.height - 1)),
        width: Math.min(rawSel.width, present.width - Math.max(0, rawSel.x)),
        height: Math.min(rawSel.height, present.height - Math.max(0, rawSel.y)),
      }
    : null

  const cursor =
    tool === 'move'       ? 'grab' :
    tool === 'select'     ? 'crosshair' :
    tool === 'eyedropper' ? 'crosshair' :
    tool === 'fill'       ? 'cell' :
    'crosshair'

  return (
    <div
      ref={wrapperRef}
      role="application"
      aria-label={`Pixel canvas, ${present.width}×${present.height} cells`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onContextMenu={(e) => e.preventDefault()}
      className="flex h-full w-full touch-none items-center justify-center overflow-auto p-8"
      style={{ cursor }}
    >
      <div
        className="relative shadow-2xl ring-1 ring-black/20"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        {/* Pixel canvas: 1px per cell, CSS-scaled for zoom */}
        <canvas
          ref={pixelCanvasRef}
          width={present.width}
          height={present.height}
          style={{ imageRendering: 'pixelated', display: 'block', width: pxW, height: pxH }}
        />
        {/* Grid line overlay at full zoomed resolution */}
        <canvas
          ref={gridCanvasRef}
          width={pxW}
          height={pxH}
          className="pointer-events-none absolute inset-0"
        />
        {displaySel && displaySel.width > 0 && displaySel.height > 0 && (
          <div
            className="pointer-events-none absolute"
            style={{
              left: displaySel.x * zoom,
              top: displaySel.y * zoom,
              width: displaySel.width * zoom,
              height: displaySel.height * zoom,
              border: '1px dashed white',
              boxShadow: '0 0 0 1px black, inset 0 0 0 1px black',
            }}
          />
        )}
      </div>
    </div>
  )
}
