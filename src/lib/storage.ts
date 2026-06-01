import type { Project } from '../types'

const KEY = '8bitsvg:project'

export function loadProject(): Project | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Project
    // Minimal shape validation — bail to a fresh project on anything unexpected.
    if (
      !parsed?.grid ||
      typeof parsed.grid.width !== 'number' ||
      typeof parsed.grid.height !== 'number' ||
      !Array.isArray(parsed.grid.cells) ||
      parsed.grid.cells.length !== parsed.grid.width * parsed.grid.height
    ) {
      return null
    }
    return parsed
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
