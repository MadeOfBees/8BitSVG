import type { FrameData, Project } from '../types'

const KEY = '8bitsvg:project'

function isValidFrameData(f: unknown): f is FrameData {
  if (!f || typeof f !== 'object') return false
  const fd = f as Record<string, unknown>
  return (
    typeof fd.width === 'number' &&
    typeof fd.height === 'number' &&
    Array.isArray(fd.layers) &&
    (fd.layers as unknown[]).length > 0 &&
    (fd.layers as unknown[]).every(
      (l) => l && typeof l === 'object' &&
        typeof (l as Record<string, unknown>).meta === 'object' &&
        Array.isArray((l as Record<string, unknown>).cells)
    )
  )
}

const MAX_SWATCHES = 64

/** Keep only well-formed #rrggbb or #rrggbbaa swatches — don't trust whatever's in localStorage. */
function validSwatches(s: unknown): string[] {
  if (!Array.isArray(s)) return []
  return s
    .filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(c))
    .slice(0, MAX_SWATCHES)
}

export function loadProject(): Project | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>

    // Old format: frames[0] is a plain Grid (has .cells at top level) — start blank.
    if (Array.isArray(parsed.frames) && (parsed.frames as unknown[])[0]) {
      const first = (parsed.frames as unknown[])[0] as Record<string, unknown>
      if (Array.isArray(first.cells)) return null
    }

    if (
      !Array.isArray(parsed.frames) ||
      parsed.frames.length === 0 ||
      parsed.frames.length > 500 ||
      !(parsed.frames as unknown[]).every(isValidFrameData)
    ) {
      return null
    }

    const frames = parsed.frames as FrameData[]
    const rawActive = typeof parsed.activeFrame === 'number' ? parsed.activeFrame : 0
    const activeFrame = Math.max(0, Math.min(Math.floor(rawActive), frames.length - 1))
    const rawLayer = typeof parsed.activeLayer === 'number' ? parsed.activeLayer : 0
    const activeLayer = Math.max(0, Math.min(Math.floor(rawLayer), frames[activeFrame].layers.length - 1))

    return {
      frames,
      activeFrame,
      activeLayer,
      swatches: validSwatches(parsed.swatches),
      foregroundColor: typeof parsed.foregroundColor === 'string' ? parsed.foregroundColor : '#000000',
      backgroundColor: typeof parsed.backgroundColor === 'string' ? parsed.backgroundColor : '#ffffff',
    }
  } catch {
    return null
  }
}

let timer: ReturnType<typeof setTimeout> | undefined

/** Debounced save so rapid drawing doesn't thrash localStorage. */
export function saveProject(project: Project): void {
  clearTimeout(timer)
  timer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(project))
    } catch {
      // Quota or serialization failure — ignore; autosave is best-effort.
    }
  }, 400)
}
