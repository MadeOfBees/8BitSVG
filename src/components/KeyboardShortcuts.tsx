import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../state/useEditor'
import type { Tool } from '../types'

const TOOL_KEYS: Record<string, Tool> = {
  b: 'pencil',
  p: 'pencil',
  e: 'eraser',
  g: 'fill',
  i: 'eyedropper',
  s: 'select',
  m: 'select',
  v: 'move',
  h: 'move',
}

/** Global keyboard shortcuts. Renders nothing. */
export function KeyboardShortcuts() {
  const { dispatch, present, selection } = useEditor()
  const presentRef = useRef(present)
  useEffect(() => { presentRef.current = present }, [present])
  const selectionRef = useRef(selection)
  useEffect(() => { selectionRef.current = selection }, [selection])

  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    let flashTimer: ReturnType<typeof setTimeout> | undefined
    const showFlash = (msg: string) => {
      setFlash(msg)
      clearTimeout(flashTimer)
      flashTimer = setTimeout(() => setFlash(null), 1400)
    }
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
      if (mod && key === 'a') {
        e.preventDefault()
        const g = presentRef.current
        dispatch({ type: 'SET_SELECTION', rect: { x: 0, y: 0, width: g.width, height: g.height } })
        return
      }
      if (mod && key === 'c') {
        e.preventDefault()
        if (!selectionRef.current) { showFlash('Nothing selected to copy'); return }
        dispatch({ type: 'COPY_SELECTION' })
        return
      }
      if (mod && key === 'v') {
        e.preventDefault()
        dispatch({ type: 'PASTE_CLIPBOARD' })
        return
      }
      if (mod && key === 'd') {
        e.preventDefault()
        dispatch({ type: 'SET_SELECTION', rect: null })
        return
      }
      if (mod && key === 'x') {
        e.preventDefault()
        if (!selectionRef.current) { showFlash('Nothing selected to cut'); return }
        dispatch({ type: 'COPY_SELECTION' })
        dispatch({ type: 'DELETE_SELECTION' })
        return
      }
      if (mod) return // leave other modified combos alone

      if (key === 'x') {
        dispatch({ type: 'SWAP_COLORS' })
        return
      }
      if (key === 'd') {
        dispatch({ type: 'RESET_COLORS' })
        return
      }

      if (e.key === 'Escape') {
        dispatch({ type: 'SET_SELECTION', rect: null })
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        dispatch({ type: 'DELETE_SELECTION' })
        return
      }

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
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(flashTimer)
    }
  }, [dispatch])

  return flash ? (
    <div
      role="status"
      className="pointer-events-none fixed bottom-20 left-1/2 z-50 -translate-x-1/2 border border-white/10 bg-neutral-800/95 px-3 py-1.5 text-xs text-neutral-100 shadow-lg"
    >
      {flash}
    </div>
  ) : null
}
