import { useEffect, useMemo, useRef, useState } from 'react'
import { LuDownload } from 'react-icons/lu'
import { useEditor } from '../state/useEditor'
import { contentBounds } from '../lib/grid'
import { toReactComponent, toSvgString } from '../lib/svg'
import type { Bounds } from '../types'

const MAX_PREVIEW = 384

export function ExportModal({ onClose }: { onClose: () => void }) {
  const { present } = useEditor()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<'svg' | 'react'>('svg')
  const [copied, setCopied] = useState(false)

  const scale = Math.max(
    4,
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

  // Draw the preview (checkerboard + cells).
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    const checker = Math.max(4, Math.floor(scale / 2))
    for (let y = 0; y < present.height * scale; y += checker) {
      for (let x = 0; x < present.width * scale; x += checker) {
        ctx.fillStyle =
          ((x / checker) + (y / checker)) % 2 === 0 ? '#cdcdd3' : '#bcbcc4'
        ctx.fillRect(x, y, checker, checker)
      }
    }
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

  // Drag-to-crop, driven by window listeners (not React's onPointerMove +
  // pointer capture) so it survives the re-render each crop update triggers
  // and keeps tracking if the cursor leaves the preview.
  const startCrop = (e: React.PointerEvent) => {
    const anchor = cellFrom(e.clientX, e.clientY)
    setCrop(rectFrom(anchor, anchor))

    const onMove = (ev: PointerEvent) => {
      setCrop(rectFrom(anchor, cellFrom(ev.clientX, ev.clientY)))
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
    await navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const download = () => {
    const ext = tab === 'svg' ? 'svg' : 'tsx'
    const type = tab === 'svg' ? 'image/svg+xml' : 'text/plain'
    const blob = new Blob([output], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `8bitsvg.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-4xl flex-col gap-4 overflow-auto border border-white/10 bg-neutral-900 p-6 text-neutral-100 shadow-2xl md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Crop preview */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Crop</h2>
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
            style={{ width: present.width * scale, height: present.height * scale }}
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
            Drag on the preview to set the crop. {crop.width}×{crop.height} cells.
          </p>
        </div>

        {/* Output */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {(['svg', 'react'] as const).map((t) => (
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
                  {t === 'svg' ? 'SVG' : 'React'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-neutral-400 hover:text-white"
            >
              ✕
            </button>
          </div>

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
              className="flex-1 bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-400"
            >
              {copied ? 'Copied!' : `Copy ${tab === 'svg' ? 'SVG' : 'component'}`}
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
        </div>
      </div>
    </div>
  )
}
