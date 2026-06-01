import { useState } from 'react'
import { useEditor } from '../state/useEditor'

/** Expand #abc → #aabbcc; return a normalized 6-digit hex or null. */
function normalizeHex(input: string): string | null {
  const v = input.trim().replace(/^#?/, '')
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toLowerCase()}`
  if (/^[0-9a-fA-F]{3}$/.test(v)) {
    return `#${v.split('').map((c) => c + c).join('').toLowerCase()}`
  }
  return null
}

export function ColorPanel() {
  const { activeColor, swatches, dispatch } = useEditor()
  const [hexDraft, setHexDraft] = useState(activeColor)

  // Sync the draft when the color changes elsewhere (picker, eyedropper, swatch).
  // Adjusting state during render is React's recommended pattern over an effect.
  const [lastColor, setLastColor] = useState(activeColor)
  if (activeColor !== lastColor) {
    setLastColor(activeColor)
    setHexDraft(activeColor)
  }

  const selectColor = (color: string) => dispatch({ type: 'SET_COLOR', color })

  const commitHex = () => {
    const normalized = normalizeHex(hexDraft)
    if (normalized) selectColor(normalized)
    else setHexDraft(activeColor) // revert invalid input
  }

  const addCurrentSwatch = () =>
    dispatch({ type: 'ADD_SWATCH', color: activeColor })

  return (
    <div className="flex w-56 flex-col gap-4 border-l border-white/10 bg-neutral-900/80 p-4">
      <div>
        <label className="mb-2 block text-xs uppercase tracking-wide text-neutral-400">
          Active color
        </label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={activeColor}
            onChange={(e) => selectColor(e.target.value)}
            className="h-10 w-12 cursor-pointer border border-white/10 bg-transparent"
          />
          <input
            type="text"
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={commitHex}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            spellCheck={false}
            maxLength={7}
            className="w-full border border-white/10 bg-neutral-800 px-2 py-1.5 font-mc text-sm uppercase"
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-neutral-400">
            Swatches
          </span>
          <button
            type="button"
            onClick={addCurrentSwatch}
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
              onClick={() => selectColor(c)}
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
      </div>
    </div>
  )
}
