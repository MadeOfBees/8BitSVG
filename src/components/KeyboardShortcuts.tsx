import { useEffect } from 'react'
import { useEditor } from '../state/useEditor'
import type { Tool } from '../types'

const TOOL_KEYS: Record<string, Tool> = {
  b: 'pencil',
  p: 'pencil',
  e: 'eraser',
  g: 'fill',
  i: 'eyedropper',
  v: 'move',
  m: 'move',
}

/** Global keyboard shortcuts. Renders nothing. */
export function KeyboardShortcuts() {
  const { dispatch } = useEditor()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack typing in inputs/textareas.
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()

      if (mod && key === 'z') {
        e.preventDefault()
        dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' })
        return
      }
      if (mod && key === 'y') {
        e.preventDefault()
        dispatch({ type: 'REDO' })
        return
      }
      if (mod) return // leave other modified combos alone

      if (key === '=' || key === '+') {
        dispatch({ type: 'ZOOM_BY', delta: 2 })
        return
      }
      if (key === '-' || key === '_') {
        dispatch({ type: 'ZOOM_BY', delta: -2 })
        return
      }

      const tool = TOOL_KEYS[key]
      if (tool) dispatch({ type: 'SET_TOOL', tool })
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  return null
}
