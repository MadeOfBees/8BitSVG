import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../state/useEditor'
import {
  clampBounds,
  extractRegion,
  flipHorizontal,
  flipVertical,
  pasteRegion,
  rotate180,
  rotateCCW,
  rotateCW,
} from '../lib/grid'
import type { Cell, FrameData, Grid } from '../types'
import { SIZE_PRESETS } from '../types'
import { parseAseFile } from '../lib/aseprite'

function isProjectDirty(frames: FrameData[]): boolean {
  if (frames.length > 1) return true
  for (const frame of frames) {
    if (frame.layers.length > 1) return true
    for (const layer of frame.layers) {
      if (layer.cells.some(c => c !== null)) return true
      if (!layer.meta.visible) return true
      if (layer.meta.opacity !== 255) return true
      if (layer.meta.name !== 'Layer 1') return true
    }
  }
  return false
}

export function TopBar({ onExport }: { onExport: () => void }) {
  const { present, frames, activeFrame, activeLayer, layers, dispatch, selection, clipboard, canUndo, canRedo } = useEditor()
  const [open, setOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const editMenuRef = useRef<HTMLDivElement>(null)
  const fileTriggerRef = useRef<HTMLButtonElement>(null)
  const editTriggerRef = useRef<HTMLButtonElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const aseInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (!open && !editOpen) return
    const onDown = (e: MouseEvent) => {
      if (open && menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
      if (editOpen && editMenuRef.current && !editMenuRef.current.contains(e.target as Node)) setEditOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (open) { setOpen(false); fileTriggerRef.current?.focus() }
        if (editOpen) { setEditOpen(false); editTriggerRef.current?.focus() }
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, editOpen])

  useEffect(() => {
    if (!open) return
    const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
    first?.focus()
  }, [open])

  useEffect(() => {
    if (!editOpen) return
    const first = editMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
    first?.focus()
  }, [editOpen])

  const handleMenuKey = (
    e: React.KeyboardEvent,
    ref: React.RefObject<HTMLDivElement | null>,
    triggerRef: React.RefObject<HTMLButtonElement | null>,
    closeFn: () => void,
  ) => {
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
    )
    if (!items.length) return
    const idx = items.indexOf(document.activeElement as HTMLButtonElement)
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); items[(idx + 1) % items.length].focus(); break
      case 'ArrowUp':   e.preventDefault(); items[(idx - 1 + items.length) % items.length].focus(); break
      case 'Home':      e.preventDefault(); items[0].focus(); break
      case 'End':       e.preventDefault(); items[items.length - 1].focus(); break
      case 'Tab':       closeFn(); break
      case 'Escape':    e.stopPropagation(); closeFn(); triggerRef.current?.focus(); break
    }
  }

  const transform = (fn: (g: Grid) => Grid) => {
    const frame = frames[activeFrame]
    if (selection) {
      // Transform the selected region of the active layer only
      const activeLayerEntry = frame.layers[activeLayer]
      const layerGrid: Grid = { width: frame.width, height: frame.height, cells: activeLayerEntry.cells }
      const regionCells = extractRegion(layerGrid, selection)
      const regionGrid: Grid = { width: selection.width, height: selection.height, cells: regionCells }
      const transformed = fn(regionGrid)
      const newGrid = pasteRegion(layerGrid, transformed.cells, selection.x, selection.y, transformed.width, transformed.height)
      const newLayers = frame.layers.map((l, i) => i === activeLayer ? { ...l, cells: newGrid.cells } : l)
      const newSel = clampBounds(
        { x: selection.x, y: selection.y, width: transformed.width, height: transformed.height },
        frame.width, frame.height,
      )
      dispatch({ type: 'TRANSFORM_GRID', frame: { ...frame, layers: newLayers } })
      dispatch({ type: 'SET_SELECTION', rect: newSel })
    } else {
      // Transform all layers
      const newLayers = frame.layers.map((l, i) => {
        const layerGrid: Grid = { width: frame.width, height: frame.height, cells: l.cells }
        const result = fn(layerGrid)
        return { ...l, cells: result.cells, ...(i === 0 ? {} : {}) }
      })
      const sample = fn({ width: frame.width, height: frame.height, cells: frame.layers[0]?.cells ?? [] })
      const newFrame: FrameData = { width: sample.width, height: sample.height, layers: newLayers }
      dispatch({ type: 'TRANSFORM_GRID', frame: newFrame })
    }
    setEditOpen(false)
  }

  const cropToSelection = () => {
    if (!selection) return
    const frame = frames[activeFrame]
    const newLayers = frame.layers.map((l) => ({
      ...l,
      cells: extractRegion({ width: frame.width, height: frame.height, cells: l.cells }, selection),
    }))
    dispatch({ type: 'TRANSFORM_GRID', frame: { width: selection.width, height: selection.height, layers: newLayers } })
    dispatch({ type: 'SET_SELECTION', rect: null })
    setEditOpen(false)
  }

  const showError = (msg: string) => {
    setImportError(msg)
    setTimeout(() => setImportError(null), 4000)
  }

  const newCanvas = (size: number) => {
    setOpen(false)
    if (
      isProjectDirty(frames) &&
      !confirm(`Start a new ${size}x${size} canvas? This clears the current drawing.`)
    ) return
    dispatch({ type: 'NEW_CANVAS', size })
  }

  const clearLayer = () => {
    setOpen(false)
    const frame = frames[activeFrame]
    const activeLayerCells = frame.layers[activeLayer].cells
    const layerEmpty = activeLayerCells.every((c) => c === null)
    if (
      !layerEmpty &&
      !confirm('Clear the active layer? All pixels on this layer will be erased.')
    ) return
    dispatch({ type: 'CLEAR' })
  }

  const resetProject = () => {
    if (isProjectDirty(frames) && !confirm('Reset project? All frames and layers will be cleared.')) return
    dispatch({ type: 'CLEAR_ALL' })
  }

  const clearAll = () => {
    setEditOpen(false)
    resetProject()
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (file.type !== 'image/png') {
      showError('Import failed: file must be a PNG.')
      return
    }

    const url = URL.createObjectURL(file)
    const img = new Image()

    img.onerror = () => { URL.revokeObjectURL(url); showError('Import failed: could not read image.') }

    img.onload = () => {
      URL.revokeObjectURL(url)
      const { naturalWidth: w, naturalHeight: h } = img

      if (w > 256 || h > 256) {
        showError(`Import failed: image must be 256x256 or smaller (got ${w}x${h}).`)
        return
      }
      if (isProjectDirty(frames) && !confirm(`Import ${w}x${h} PNG? This replaces the current drawing.`)) return

      const offscreen = document.createElement('canvas')
      offscreen.width = w; offscreen.height = h
      const ctx = offscreen.getContext('2d')
      if (!ctx) { showError('Import failed: canvas context unavailable.'); return }
      ctx.drawImage(img, 0, 0)
      const { data } = ctx.getImageData(0, 0, w, h)

      const cells: Cell[] = []
      for (let i = 0; i < w * h; i++) {
        const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3]
        // Treat pixels with alpha < 10 as transparent to avoid importing barely-visible near-zero artifacts.
        if (a < 10) {
          cells.push(null)
        } else {
          const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
          cells.push(a < 255 ? hex + a.toString(16).padStart(2, '0') : hex)
        }
      }

      dispatch({ type: 'LOAD_GRID', grid: { width: w, height: h, cells } })
    }

    img.src = url
  }

  const handleImportAse = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const buffer = await file.arrayBuffer()
      const imported = await parseAseFile(buffer)
      if (
        isProjectDirty(frames) &&
        !confirm(`Import ${imported[0].width}x${imported[0].height} Aseprite file (${imported.length} frame${imported.length !== 1 ? 's' : ''})? This replaces the current drawing.`)
      ) return
      dispatch({ type: 'LOAD_FRAMES', frames: imported })
    } catch (err) {
      showError(`Import failed: ${err instanceof Error ? err.message : 'Could not read file.'}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="flex h-10 shrink-0 items-center gap-4 border-b border-white/10 bg-neutral-900/80 px-4">
      <h1 className="text-sm font-bold tracking-tight">8BitSVG</h1>

      {/* File dropdown */}
      <div ref={menuRef} className="relative">
        <button
          ref={fileTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls="file-menu"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 bg-neutral-800 px-3 py-1 text-sm hover:bg-neutral-700"
        >
          File
          <span className="text-[10px] opacity-60" aria-hidden="true">▾</span>
        </button>

        {open && (
          <div
            id="file-menu"
            role="menu"
            aria-label="File"
            onKeyDown={(e) => handleMenuKey(e, menuRef, fileTriggerRef, () => setOpen(false))}
            className="absolute left-0 top-full z-50 mt-0.5 min-w-40 border border-white/10 bg-neutral-900 py-1 shadow-xl"
          >
            <div role="group" aria-label="New Canvas">
              <span aria-hidden="true" className="block px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-500">
                New Canvas
              </span>
              {SIZE_PRESETS.map((size) => (
                <button
                  key={size}
                  role="menuitem"
                  type="button"
                  tabIndex={-1}
                  onClick={() => newCanvas(size)}
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700"
                >
                  {size}x{size}
                </button>
              ))}
            </div>
            <div role="separator" className="my-1 border-t border-white/10" />
            <button
              role="menuitem" type="button" tabIndex={-1}
              onClick={() => { setOpen(false); fileInputRef.current?.click() }}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700"
            >
              Import PNG…
            </button>
            <button
              role="menuitem" type="button" tabIndex={-1}
              disabled={importing}
              onClick={() => { setOpen(false); aseInputRef.current?.click() }}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {importing ? 'Importing…' : 'Import Aseprite…'}
            </button>
            <div role="separator" className="my-1 border-t border-white/10" />
            <button
              role="menuitem" type="button" tabIndex={-1}
              onClick={() => { setOpen(false); onExport() }}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700"
            >
              Export…
            </button>
            <div role="separator" className="my-1 border-t border-white/10" />
            <button
              role="menuitem" type="button" tabIndex={-1}
              onClick={clearLayer}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700"
            >
              Clear Layer
            </button>
            <button
              role="menuitem" type="button" tabIndex={-1}
              onClick={() => { setOpen(false); resetProject() }}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700"
            >
              Reset Project…
            </button>
          </div>
        )}
      </div>

      {/* Edit dropdown */}
      <div ref={editMenuRef} className="relative">
        <button
          ref={editTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={editOpen}
          aria-controls="edit-menu"
          onClick={() => setEditOpen((o) => !o)}
          className="flex items-center gap-1 bg-neutral-800 px-3 py-1 text-sm hover:bg-neutral-700"
        >
          Edit
          <span className="text-[10px] opacity-60" aria-hidden="true">▾</span>
        </button>

        {editOpen && (
          <div
            id="edit-menu"
            role="menu"
            aria-label="Edit"
            onKeyDown={(e) => handleMenuKey(e, editMenuRef, editTriggerRef, () => setEditOpen(false))}
            className="absolute left-0 top-full z-50 mt-0.5 min-w-52 border border-white/10 bg-neutral-900 py-1 shadow-xl"
          >
            {/* Undo / Redo */}
            <button
              role="menuitem" type="button" tabIndex={-1}
              disabled={!canUndo}
              onClick={() => { dispatch({ type: 'UNDO' }); setEditOpen(false) }}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Undo <span className="text-xs text-neutral-500">Ctrl+Z</span>
            </button>
            <button
              role="menuitem" type="button" tabIndex={-1}
              disabled={!canRedo}
              onClick={() => { dispatch({ type: 'REDO' }); setEditOpen(false) }}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Redo <span className="text-xs text-neutral-500">Ctrl+Shift+Z</span>
            </button>
            <div role="separator" className="my-1 border-t border-white/10" />

            {/* Selection */}
            <div role="group" aria-label="Selection">
              <span aria-hidden="true" className="block px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-500">
                Selection
              </span>
              <button
                role="menuitem" type="button" tabIndex={-1}
                onClick={() => {
                  dispatch({ type: 'SET_SELECTION', rect: { x: 0, y: 0, width: present.width, height: present.height } })
                  setEditOpen(false)
                }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-neutral-700"
              >
                Select All <span className="text-xs text-neutral-500">Ctrl+A</span>
              </button>
              <button
                role="menuitem" type="button" tabIndex={-1}
                disabled={!selection}
                onClick={() => { dispatch({ type: 'SET_SELECTION', rect: null }); setEditOpen(false) }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Deselect <span className="text-xs text-neutral-500">Ctrl+D</span>
              </button>
              <button
                role="menuitem" type="button" tabIndex={-1}
                disabled={!selection}
                onClick={() => { dispatch({ type: 'COPY_SELECTION' }); setEditOpen(false) }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Copy <span className="text-xs text-neutral-500">Ctrl+C</span>
              </button>
              <button
                role="menuitem" type="button" tabIndex={-1}
                disabled={!selection}
                onClick={() => {
                  dispatch({ type: 'COPY_SELECTION' })
                  dispatch({ type: 'DELETE_SELECTION' })
                  setEditOpen(false)
                }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Cut <span className="text-xs text-neutral-500">Ctrl+X</span>
              </button>
              <button
                role="menuitem" type="button" tabIndex={-1}
                disabled={!clipboard}
                onClick={() => { dispatch({ type: 'PASTE_CLIPBOARD' }); setEditOpen(false) }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Paste <span className="text-xs text-neutral-500">Ctrl+V</span>
              </button>
              <button
                role="menuitem" type="button" tabIndex={-1}
                disabled={!selection}
                onClick={() => { dispatch({ type: 'DELETE_SELECTION' }); setEditOpen(false) }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Delete <span className="text-xs text-neutral-500">Del</span>
              </button>
            </div>
            <div role="separator" className="my-1 border-t border-white/10" />

            {/* Transform */}
            <div role="group" aria-label={selection ? 'Transform Selection' : 'Transform'}>
              <span aria-hidden="true" className="block px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-500">
                Transform{selection ? ' Selection' : ''}
              </span>
              <button role="menuitem" type="button" tabIndex={-1} onClick={() => transform(flipHorizontal)} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700">
                Flip Horizontal
              </button>
              <button role="menuitem" type="button" tabIndex={-1} onClick={() => transform(flipVertical)} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700">
                Flip Vertical
              </button>
              <button role="menuitem" type="button" tabIndex={-1} onClick={() => transform(rotateCW)} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700">
                Rotate 90° CW
              </button>
              <button role="menuitem" type="button" tabIndex={-1} onClick={() => transform(rotateCCW)} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700">
                Rotate 90° CCW
              </button>
              <button role="menuitem" type="button" tabIndex={-1} onClick={() => transform(rotate180)} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700">
                Rotate 180°
              </button>
            </div>
            <div role="separator" className="my-1 border-t border-white/10" />
            <button
              role="menuitem" type="button" tabIndex={-1}
              disabled={!selection}
              onClick={cropToSelection}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Crop to Selection
            </button>
            <div role="separator" className="my-1 border-t border-white/10" />

            {/* Layers */}
            <div role="group" aria-label="Layers">
              <span aria-hidden="true" className="block px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-500">
                Layers
              </span>
              <button
                role="menuitem" type="button" tabIndex={-1}
                onClick={() => { dispatch({ type: 'DUPLICATE_LAYER' }); setEditOpen(false) }}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700"
              >
                Duplicate Layer
              </button>
              <button
                role="menuitem" type="button" tabIndex={-1}
                disabled={activeLayer === 0}
                onClick={() => { dispatch({ type: 'MERGE_DOWN' }); setEditOpen(false) }}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Merge Down
              </button>
              <button
                role="menuitem" type="button" tabIndex={-1}
                disabled={layers.length <= 1}
                onClick={() => { dispatch({ type: 'FLATTEN_LAYERS' }); setEditOpen(false) }}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Flatten All Layers
              </button>
            </div>
            <div role="separator" className="my-1 border-t border-white/10" />
            <button
              role="menuitem" type="button" tabIndex={-1}
              onClick={clearAll}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700"
            >
              Clear All Frames
            </button>
          </div>
        )}
      </div>

      {/* Canvas size indicator */}
      <span className="text-xs text-neutral-400">
        {present.width}x{present.height}
      </span>

      {importing && (
        <span role="status" className="text-xs text-neutral-400">Importing…</span>
      )}
      {importError && (
        <span role="alert" className="text-xs text-red-400">{importError}</span>
      )}

      <input ref={fileInputRef} type="file" accept="image/png" className="hidden" onChange={handleImport} />
      <input ref={aseInputRef} type="file" accept=".ase,.aseprite" className="hidden" onChange={handleImportAse} />

      <button
        type="button"
        onClick={onExport}
        className="ml-auto bg-emerald-500 px-4 py-1 text-sm font-medium text-emerald-950 hover:bg-emerald-400"
      >
        Export SVG
      </button>
    </div>
  )
}
