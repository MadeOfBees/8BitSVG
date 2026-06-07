import { useRef, useState } from 'react'
import { useEditor } from '../state/useEditor'

function normalizeHex(input: string): string | null {
  const v = input.trim().replace(/^#?/, '')
  if (/^[0-9a-fA-F]{8}$/.test(v)) return `#${v.toLowerCase()}`
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toLowerCase()}`
  if (/^[0-9a-fA-F]{4}$/.test(v)) return `#${v.split('').map((c) => c + c).join('').toLowerCase()}`
  if (/^[0-9a-fA-F]{3}$/.test(v)) return `#${v.split('').map((c) => c + c).join('').toLowerCase()}`
  return null
}

export function ColorPanel() {
  const { foregroundColor, backgroundColor, swatches, dispatch } = useEditor()
  const [slot, setSlot] = useState<'fg' | 'bg'>('fg')
  const [loadError, setLoadError] = useState<string | null>(null)
  const paletteInputRef = useRef<HTMLInputElement>(null)
  const fgPickerRef = useRef<HTMLInputElement>(null)
  const bgPickerRef = useRef<HTMLInputElement>(null)

  const activeColor = foregroundColor
  const setColor = (color: string) => dispatch({ type: 'SET_COLOR', color })

  const [hexDraft, setHexDraft] = useState(activeColor)
  const [lastActive, setLastActive] = useState(activeColor)
  if (activeColor !== lastActive) {
    setLastActive(activeColor)
    setHexDraft(activeColor)
  }

  const commitHex = () => {
    const normalized = normalizeHex(hexDraft)
    if (normalized) setColor(normalized)
    else setHexDraft(activeColor)
  }

  const rgbPart = activeColor.slice(0, 7)
  const alphaValue = activeColor.length === 9 ? parseInt(activeColor.slice(7, 9), 16) : 255

  const handleAlphaChange = (a: number) => {
    setColor(a === 255 ? rgbPart : rgbPart + a.toString(16).padStart(2, '0'))
  }

  const savePalette = () => {
    const blob = new Blob([JSON.stringify({ swatches }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'palette.json'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  const loadPalette = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string)
        const list: unknown = json?.swatches
        if (
          !Array.isArray(list) ||
          !list.every((c) => typeof c === 'string' && /^#[0-9a-fA-F]{6,8}$/i.test(c))
        ) {
          setLoadError('Invalid palette file.')
          setTimeout(() => setLoadError(null), 3000)
          return
        }
        dispatch({ type: 'LOAD_SWATCHES', swatches: list as string[] })
      } catch {
        setLoadError('Could not parse JSON.')
        setTimeout(() => setLoadError(null), 3000)
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="flex flex-col gap-4 bg-neutral-900/80 p-4">

      {/* ── Color chips ────────────────────────────────── */}
      <div>
        <span className="mb-3 block text-xs uppercase tracking-wide text-neutral-400">Color</span>

        <div className="flex items-start gap-3">
          {/* Overlapping chip container — 58x58px, single click handler with proximity hit-test */}
          <div
            className="relative shrink-0 cursor-pointer"
            style={{ width: 58, height: 58 }}
            title="Foreground / Background colors"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const x = e.clientX - rect.left
              const y = e.clientY - rect.top
              const toFG = Math.hypot(x - 22, y - 22)
              const toBG = Math.hypot(x - 36, y - 36)
              if (toFG <= toBG) { setSlot('fg'); fgPickerRef.current?.click() }
              else { setSlot((s) => s === 'fg' ? 'bg' : 'fg'); dispatch({ type: 'SWAP_COLORS' }) }
            }}
          >
            {/* BG chip — visual only, bottom-right */}
            <div
              aria-label="Background color"
              className="pointer-events-none absolute bottom-0 right-0 h-11 w-11 border border-white/15 transition-colors"
              style={{ backgroundColor: backgroundColor.slice(0, 7) }}
            />
            {/* FG chip — visual only, top-left, drawn on top */}
            <div
              aria-label="Foreground color"
              className="pointer-events-none absolute left-0 top-0 z-10 h-11 w-11 border border-neutral-400 transition-colors"
              style={{ backgroundColor: foregroundColor.slice(0, 7) }}
            />
          </div>

          {/* Right column: slot label + action buttons */}
          <div className="flex flex-1 flex-col gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-neutral-500">Editing</p>
              <p className="text-sm font-medium text-neutral-100">{slot === 'fg' ? 'Foreground' : 'Background'}</p>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                title="Swap foreground / background (X)"
                onClick={() => { setSlot((s) => s === 'fg' ? 'bg' : 'fg'); dispatch({ type: 'SWAP_COLORS' }) }}
                className="flex-1 bg-neutral-800 py-1 text-xs hover:bg-neutral-700"
              >
                Swap
              </button>
              <button
                type="button"
                title="Reset to black / white (D)"
                onClick={() => dispatch({ type: 'RESET_COLORS' })}
                className="flex-1 bg-neutral-800 py-1 text-xs hover:bg-neutral-700"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Hex + alpha ────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-500">A</span>
          <input
            type="range"
            min={0}
            max={255}
            value={alphaValue}
            onChange={(e) => handleAlphaChange(parseInt(e.target.value, 10))}
            aria-label="Alpha"
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-emerald-400"
          />
          <span className="w-8 text-right text-[11px] tabular-nums text-neutral-400">
            {Math.round(alphaValue / 2.55)}%
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            aria-label="Hex value"
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={commitHex}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            spellCheck={false}
            maxLength={9}
            className="min-w-0 flex-1 border border-white/10 bg-neutral-800 px-2 py-1.5 font-mc text-sm uppercase"
          />
        </div>
      </div>

      {/* ── Swatches ───────────────────────────────────── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-neutral-400">Swatches</span>
          <button
            type="button"
            onClick={() => dispatch({ type: 'ADD_SWATCH', color: activeColor })}
            className="bg-neutral-800 px-2 py-0.5 text-xs hover:bg-neutral-700"
          >
            + Save
          </button>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              title={`${c} — right-click to remove`}
              onClick={() => setColor(c)}
              onContextMenu={(e) => {
                e.preventDefault()
                dispatch({ type: 'REMOVE_SWATCH', color: c })
              }}
              className={`aspect-square border ${
                c.toLowerCase() === activeColor.toLowerCase()
                  ? 'border-white ring-2 ring-white/60'
                  : 'border-white/10'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-tight text-neutral-500">
          Click to use · right-click to remove
        </p>
        <div className="mt-3 flex gap-1.5">
          <button type="button" onClick={savePalette} className="flex-1 bg-neutral-800 py-2 text-xs hover:bg-neutral-700">
            Export
          </button>
          <button type="button" onClick={() => paletteInputRef.current?.click()} className="flex-1 bg-neutral-800 py-2 text-xs hover:bg-neutral-700">
            Import
          </button>
        </div>
        {loadError && <p role="alert" className="mt-1 text-[11px] text-red-400">{loadError}</p>}
        <input ref={paletteInputRef} type="file" accept="application/json,.json" className="hidden" onChange={loadPalette} />
        <input ref={fgPickerRef} type="color" value={foregroundColor.slice(0, 7)}
          onChange={(e) => dispatch({ type: 'SET_COLOR', color: foregroundColor.length === 9 ? e.target.value + foregroundColor.slice(7) : e.target.value })}
          className="hidden" />
        <input ref={bgPickerRef} type="color" value={backgroundColor.slice(0, 7)}
          onChange={(e) => dispatch({ type: 'SET_BACKGROUND_COLOR', color: backgroundColor.length === 9 ? e.target.value + backgroundColor.slice(7) : e.target.value })}
          className="hidden" />
      </div>
    </div>
  )
}
