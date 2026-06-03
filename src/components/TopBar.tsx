import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../state/useEditor'
import {
  extractRegion,
  flipHorizontal,
  flipVertical,
  isEmpty,
  pasteRegion,
  rotate180,
  rotateCCW,
  rotateCW,
} from '../lib/grid'
import type { Bounds, Cell, Grid } from '../types'
import { SIZE_PRESETS } from '../types'

export function TopBar({ onExport }: { onExport: () => void }) {
  const { present, dispatch, selection, clipboard } = useEditor()
  const [open, setOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const editMenuRef = useRef<HTMLDivElement>(null)
  const fileTriggerRef = useRef<HTMLButtonElement>(null)
  const editTriggerRef = useRef<HTMLButtonElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)

  // Close on outside-click. Escape closes + returns focus, with stopPropagation so the
  // global KeyboardShortcuts handler does not also clear the selection.
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

  // Auto-focus the first enabled item when a dropdown opens.
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

  /** Arrow-key / Home / End / Tab navigation inside a menu. */
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
      case 'ArrowDown':
        e.preventDefault()
        items[(idx + 1) % items.length].focus()
        break
      case 'ArrowUp':
        e.preventDefault()
        items[(idx - 1 + items.length) % items.length].focus()
        break
      case 'Home':
        e.preventDefault()
        items[0].focus()
        break
      case 'End':
        e.preventDefault()
        items[items.length - 1].focus()
        break
      case 'Tab':
        closeFn()
        break
      case 'Escape':
        e.stopPropagation()
        closeFn()
        triggerRef.current?.focus()
        break
    }
  }

  const transform = (fn: (g: Grid) => Grid) => {
    if (selection) {
      const regionCells = extractRegion(present, selection)
      const regionGrid: Grid = { width: selection.width, height: selection.height, cells: regionCells }
      const transformed = fn(regionGrid)
      const newGrid = pasteRegion(present, transformed.cells, selection.x, selection.y, transformed.width, transformed.height)
      // Clamp the new selection so a rotation near the canvas edge can't overhang.
      const newSel: Bounds = {
        x: selection.x,
        y: selection.y,
        width: Math.min(transformed.width, present.width - selection.x),
        height: Math.min(transformed.height, present.height - selection.y),
      }
      dispatch({ type: 'TRANSFORM_GRID', grid: newGrid })
      dispatch({ type: 'SET_SELECTION', rect: newSel })
    } else {
      dispatch({ type: 'TRANSFORM_GRID', grid: fn(present) })
    }
    setEditOpen(false)
  }

  const cropToSelection = () => {
    if (!selection) return
    const cells = extractRegion(present, selection)
    dispatch({ type: 'TRANSFORM_GRID', grid: { width: selection.width, height: selection.height, cells } })
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
      !isEmpty(present) &&
      !confirm(`Start a new ${size}×${size} canvas? This clears the current drawing.`)
    ) {
      return
    }
    dispatch({ type: 'NEW_CANVAS', size })
  }

  const clearCanvas = () => {
    setOpen(false)
    if (
      !isEmpty(present) &&
      !confirm('Clear the canvas? All pixels will be erased.')
    ) {
      return
    }
    dispatch({ type: 'CLEAR' })
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

    img.onerror = () => {
      URL.revokeObjectURL(url)
      showError('Import failed: could not read image.')
    }

    img.onload = () => {
      URL.revokeObjectURL(url)
      const { naturalWidth: w, naturalHeight: h } = img

      if (w > 256 || h > 256) {
        showError(`Import failed: image must be 256×256 or smaller (got ${w}×${h}).`)
        return
      }
      if (
        !isEmpty(present) &&
        !confirm(`Import ${w}×${h} PNG? This replaces the current drawing.`)
      ) {
        return
      }

      const offscreen = document.createElement('canvas')
      offscreen.width = w
      offscreen.height = h
      const ctx = offscreen.getContext('2d')
      if (!ctx) {
        showError('Import failed: canvas context unavailable.')
        return
      }
      ctx.drawImage(img, 0, 0)
      const { data } = ctx.getImageData(0, 0, w, h)

      const cells: Cell[] = []
      for (let i = 0; i < w * h; i++) {
        const r = data[i * 4]
        const g = data[i * 4 + 1]
        const b = data[i * 4 + 2]
        const a = data[i * 4 + 3]
        cells.push(
          a < 10
            ? null
            : `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`,
        )
      }

      dispatch({ type: 'LOAD_GRID', grid: { width: w, height: h, cells } })
    }

    img.src = url
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
            ref={menuRef as React.RefObject<HTMLDivElement>}
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
                  className="block w-full px-6 py-1.5 text-left text-sm hover:bg-neutral-700"
                >
                  {size}×{size}
                </button>
              ))}
            </div>
            <div role="separator" className="my-1 border-t border-white/10" />
            <button
              role="menuitem"
              type="button"
              tabIndex={-1}
              onClick={() => { setOpen(false); fileInputRef.current?.click() }}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700"
            >
              Import PNG…
            </button>
            <div role="separator" className="my-1 border-t border-white/10" />
            <button
              role="menuitem"
              type="button"
              tabIndex={-1}
              onClick={clearCanvas}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700"
            >
              Clear Canvas
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
            ref={editMenuRef as React.RefObject<HTMLDivElement>}
            onKeyDown={(e) => handleMenuKey(e, editMenuRef, editTriggerRef, () => setEditOpen(false))}
            className="absolute left-0 top-full z-50 mt-0.5 min-w-48 border border-white/10 bg-neutral-900 py-1 shadow-xl"
          >
            <div role="group" aria-label="Selection">
              <span aria-hidden="true" className="block px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-500">
                Selection
              </span>
              <button
                role="menuitem" type="button" tabIndex={-1}
                disabled={!selection}
                onClick={() => { dispatch({ type: 'COPY_SELECTION' }); setEditOpen(false) }}
                className="flex w-full items-center justify-between px-6 py-1.5 text-left text-sm hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Copy <span className="text-xs text-neutral-500">Ctrl+C</span>
              </button>
              <button
                role="menuitem" type="button" tabIndex={-1}
                disabled={!clipboard}
                onClick={() => { dispatch({ type: 'PASTE_CLIPBOARD' }); setEditOpen(false) }}
                className="flex w-full items-center justify-between px-6 py-1.5 text-left text-sm hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Paste <span className="text-xs text-neutral-500">Ctrl+V</span>
              </button>
              <button
                role="menuitem" type="button" tabIndex={-1}
                disabled={!selection}
                onClick={() => { dispatch({ type: 'DELETE_SELECTION' }); setEditOpen(false) }}
                className="flex w-full items-center justify-between px-6 py-1.5 text-left text-sm hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Delete <span className="text-xs text-neutral-500">Del</span>
              </button>
            </div>
            <div role="separator" className="my-1 border-t border-white/10" />
            <div role="group" aria-label={selection ? 'Transform Selection' : 'Transform'}>
              <span aria-hidden="true" className="block px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-500">
                Transform{selection ? ' Selection' : ''}
              </span>
              <button role="menuitem" type="button" tabIndex={-1} onClick={() => transform(flipHorizontal)} className="block w-full px-6 py-1.5 text-left text-sm hover:bg-neutral-700">
                Flip Horizontal
              </button>
              <button role="menuitem" type="button" tabIndex={-1} onClick={() => transform(flipVertical)} className="block w-full px-6 py-1.5 text-left text-sm hover:bg-neutral-700">
                Flip Vertical
              </button>
              <button role="menuitem" type="button" tabIndex={-1} onClick={() => transform(rotateCW)} className="block w-full px-6 py-1.5 text-left text-sm hover:bg-neutral-700">
                Rotate 90° CW
              </button>
              <button role="menuitem" type="button" tabIndex={-1} onClick={() => transform(rotateCCW)} className="block w-full px-6 py-1.5 text-left text-sm hover:bg-neutral-700">
                Rotate 90° CCW
              </button>
              <button role="menuitem" type="button" tabIndex={-1} onClick={() => transform(rotate180)} className="block w-full px-6 py-1.5 text-left text-sm hover:bg-neutral-700">
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
          </div>
        )}
      </div>

      {/* Canvas size indicator */}
      <span className="text-xs text-neutral-400">
        {present.width}×{present.height}
      </span>

      {/* Import error */}
      {importError && (
        <span role="alert" className="text-xs text-red-400">{importError}</span>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png"
        className="hidden"
        onChange={handleImport}
      />

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
