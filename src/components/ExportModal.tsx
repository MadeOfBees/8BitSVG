import { useEffect, useMemo, useRef, useState } from 'react'
import { LuDownload } from 'react-icons/lu'
import { useEditor } from '../state/useEditor'
import { contentBounds } from '../lib/grid'
import { toReactComponent, toSvgString } from '../lib/svg'
import { toAseBuffer } from '../lib/ase-writer'
import type { Bounds } from '../types'

const MAX_PREVIEW = 384
// Match the main canvas checker colors exactly.
const CHECKER_LIGHT = '#ffffff'
const CHECKER_DARK = '#d4d4db'

/** CSS checkerboard at the given square size. */
function checkerBg(sq: number): React.CSSProperties {
  return {
    background: `repeating-conic-gradient(${CHECKER_LIGHT} 0% 25%, ${CHECKER_DARK} 0% 50%) 0 0 / ${sq * 2}px ${sq * 2}px`,
  }
}

export function ExportModal({ onClose }: { onClose: () => void }) {
  const { present, frames } = useEditor()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<'svg' | 'react' | 'png' | 'ase'>('svg')
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  // Scale so the preview fills up to MAX_PREVIEW px but is never smaller than 200px.
  const scale = Math.max(
    Math.ceil(200 / Math.max(present.width, present.height)),
    Math.floor(MAX_PREVIEW / Math.max(present.width, present.height)),
  )

  // Crop defaults to the painted content's bounding box (or the whole grid).
  const [crop, setCrop] = useState<Bounds>(
    () =>
      contentBounds(present) ?? {
        x: 0,
        y: 0,
        width: present.width,
        height: present.height,
      },
  )

  // Focus the panel on mount; return focus to whatever triggered the modal on unmount.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => { previous?.focus() }
  }, [])

  // Focus trap: keep Tab cycling within the panel.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab') return
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    panel.addEventListener('keydown', trap)
    return () => panel.removeEventListener('keydown', trap)
  }, [])

  // Draw the preview (cells only — checker comes from CSS on stageRef).
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, present.width * scale, present.height * scale)
    for (let cy = 0; cy < present.height; cy++) {
      for (let cx = 0; cx < present.width; cx++) {
        const c = present.cells[cy * present.width + cx]
        if (c) {
          ctx.fillStyle = c
          ctx.fillRect(cx * scale, cy * scale, scale, scale)
        }
      }
    }
  }, [present, scale])

  const cellFrom = (clientX: number, clientY: number) => {
    const rect = stageRef.current!.getBoundingClientRect()
    const x = Math.floor(((clientX - rect.left) / rect.width) * present.width)
    const y = Math.floor(((clientY - rect.top) / rect.height) * present.height)
    return {
      x: Math.min(present.width - 1, Math.max(0, x)),
      y: Math.min(present.height - 1, Math.max(0, y)),
    }
  }

  const rectFrom = (a: { x: number; y: number }, b: { x: number; y: number }): Bounds => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x) + 1,
    height: Math.abs(a.y - b.y) + 1,
  })

  // Drag-to-crop using a stable window-listener approach.
  // We capture the teardown function in a ref so the panel unmount effect can clean it up.
  const dragTeardownRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => { dragTeardownRef.current?.() }
  }, [])

  const startCrop = (e: React.PointerEvent) => {
    dragTeardownRef.current?.() // cancel any in-flight drag
    // Take a stable snapshot of present at drag-start time.
    const presentAtStart = present
    const anchor = cellFrom(e.clientX, e.clientY)
    setCrop(rectFrom(anchor, anchor))

    const onMove = (ev: PointerEvent) => {
      const rect = stageRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = Math.min(presentAtStart.width - 1, Math.max(0, Math.floor(((ev.clientX - rect.left) / rect.width) * presentAtStart.width)))
      const y = Math.min(presentAtStart.height - 1, Math.max(0, Math.floor(((ev.clientY - rect.top) / rect.height) * presentAtStart.height)))
      setCrop(rectFrom(anchor, { x, y }))
    }
    const teardown = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', teardown)
      window.removeEventListener('pointercancel', teardown)
      dragTeardownRef.current = null
    }
    dragTeardownRef.current = teardown
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', teardown)
    window.addEventListener('pointercancel', teardown)
  }

  const resetToContent = () => {
    const b = contentBounds(present)
    if (b) setCrop(b)
  }

  const output = useMemo(
    () =>
      tab === 'svg'
        ? toSvgString(present, crop)
        : toReactComponent(present, crop),
    [tab, present, crop],
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(output)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopyError(true)
      setTimeout(() => setCopyError(false), 2000)
    }
  }

  const showExportError = (msg: string) => {
    setExportError(msg)
    setTimeout(() => setExportError(null), 4000)
  }

  const downloadAse = () => {
    let buf: Uint8Array<ArrayBuffer>
    try {
      buf = toAseBuffer(frames)
    } catch (e) {
      showExportError(`Aseprite export failed: ${e instanceof Error ? e.message : 'unknown error'}`)
      return
    }
    const blob = new Blob([buf], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'pixel-art.aseprite'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  const download = () => {
    const ext = tab === 'svg' ? 'svg' : 'tsx'
    const type = tab === 'svg' ? 'image/svg+xml' : 'text/plain'
    const blob = new Blob([output], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `8bitsvg.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Defer revoke so the browser has time to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  const downloadPng = () => {
    const offscreen = document.createElement('canvas')
    offscreen.width = crop.width
    offscreen.height = crop.height
    const ctx = offscreen.getContext('2d')
    if (!ctx) {
      showExportError('PNG export failed: canvas context unavailable.')
      return
    }
    ctx.clearRect(0, 0, crop.width, crop.height)
    for (let cy = 0; cy < crop.height; cy++) {
      for (let cx = 0; cx < crop.width; cx++) {
        const c = present.cells[(crop.y + cy) * present.width + (crop.x + cx)]
        if (c) {
          ctx.fillStyle = c
          ctx.fillRect(cx, cy, 1, 1)
        }
      }
    }
    setDownloading(true)
    offscreen.toBlob((blob) => {
      setDownloading(false)
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = '8bitsvg.png'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    }, 'image/png')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
        tabIndex={-1}
        className="flex max-h-full w-full max-w-4xl flex-col gap-4 overflow-auto border border-white/10 bg-neutral-900 p-6 text-neutral-100 shadow-2xl outline-none md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Crop preview */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 id="export-modal-title" className="text-lg font-semibold">Export</h2>
            <button
              type="button"
              onClick={resetToContent}
              className="bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700"
            >
              Fit to content
            </button>
          </div>
          <div
            ref={stageRef}
            onPointerDown={startCrop}
            className="relative cursor-crosshair touch-none self-start overflow-hidden"
            style={{
              width: present.width * scale,
              height: present.height * scale,
              ...checkerBg(scale),
            }}
          >
            <canvas
              ref={canvasRef}
              width={present.width * scale}
              height={present.height * scale}
              className="block ring-1 ring-white/10"
              style={{ imageRendering: 'pixelated' }}
            />
            {/* Dim outside crop + highlight inside via a giant box-shadow. */}
            <div
              className="pointer-events-none absolute border-2 border-emerald-400"
              style={{
                left: crop.x * scale,
                top: crop.y * scale,
                width: crop.width * scale,
                height: crop.height * scale,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
              }}
            />
          </div>
          <p className="text-xs text-neutral-400">
            Drag on the preview to set the crop. {crop.width}x{crop.height} cells.
          </p>
        </div>

        {/* Output */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {(['svg', 'react', 'png', 'ase'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-sm ${
                    tab === t
                      ? 'bg-indigo-500'
                      : 'bg-neutral-800 hover:bg-neutral-700'
                  }`}
                >
                  {t === 'svg' ? 'SVG' : t === 'react' ? 'React' : t === 'png' ? 'PNG' : 'Aseprite'}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="text-neutral-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          {tab === 'ase' ? (
            <div className="flex flex-1 flex-col items-start justify-start gap-4">
              <p className="text-sm text-neutral-400">
                Saves all {frames.length} frame{frames.length !== 1 ? 's' : ''} with {frames[0]?.layers.length ?? 1} layer{(frames[0]?.layers.length ?? 1) !== 1 ? 's' : ''} as an Aseprite file.
                <br />
                <span className="text-neutral-500">{present.width}x{present.height} px · RGBA</span>
              </p>
              <button
                type="button"
                onClick={downloadAse}
                className="flex items-center gap-1.5 bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
              >
                <LuDownload size={15} aria-hidden />
                Download .aseprite
              </button>
              {exportError && <p role="alert" className="text-xs text-red-400">{exportError}</p>}
            </div>
          ) : tab === 'png' ? (
            <div className="flex flex-1 flex-col items-start justify-start gap-4">
              <p className="text-sm text-neutral-400">
                Saves the cropped region as a PNG.
                <br />
                <span className="text-neutral-500">{crop.width}x{crop.height} px</span>
              </p>
              <button
                type="button"
                onClick={downloadPng}
                disabled={downloading}
                className="flex items-center gap-1.5 bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-60"
              >
                <LuDownload size={15} aria-hidden />
                {downloading ? 'Saving…' : 'Download PNG'}
              </button>
              {exportError && <p role="alert" className="text-xs text-red-400">{exportError}</p>}
            </div>
          ) : (
            <>
              <textarea
                readOnly
                value={output}
                spellCheck={false}
                className="h-72 w-full flex-1 resize-none border border-white/10 bg-neutral-800 p-3 font-mc text-xs leading-relaxed text-neutral-200"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={copy}
                  className={`flex-1 px-4 py-2 text-sm font-medium ${copyError ? 'bg-red-600 text-white' : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'}`}
                >
                  {copied ? 'Copied!' : copyError ? 'Copy failed' : `Copy ${tab === 'svg' ? 'SVG' : 'component'}`}
                </button>
                <button
                  type="button"
                  onClick={download}
                  className="flex flex-1 items-center justify-center gap-1.5 bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
                >
                  <LuDownload size={15} aria-hidden />
                  Download .{tab === 'svg' ? 'svg' : 'tsx'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
