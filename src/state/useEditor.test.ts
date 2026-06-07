import { describe, expect, it } from 'vitest'
import { reducer, type State } from './useEditor'
import { filledArray, setCell } from '../lib/grid'
import type { FrameData } from '../types'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeFrame(w = 4, h = 4): FrameData {
  return {
    width: w,
    height: h,
    layers: [{
      meta: { id: 'l0', name: 'Layer 1', visible: true, opacity: 255, blendMode: 0 },
      cells: filledArray(w * h, null),
    }],
  }
}

function makeState(n = 1): State {
  return {
    past: [],
    future: [],
    frames: Array.from({ length: n }, () => makeFrame()),
    activeFrame: 0,
    activeLayer: 0,
    tool: 'pencil',
    foregroundColor: '#000000',
    backgroundColor: '#ffffff',
    swatches: [],
    zoom: 16,
    selection: null,
    clipboard: null,
  }
}

// ── frame operations ──────────────────────────────────────────────────────────

describe('frame operations are undoable', () => {
  it('UNDO restores a removed frame', () => {
    let s = makeState(2)
    s = reducer(s, { type: 'REMOVE_FRAME', index: 1 })
    expect(s.frames).toHaveLength(1)
    s = reducer(s, { type: 'UNDO' })
    expect(s.frames).toHaveLength(2)
  })

  it('UNDO reverses ADD_FRAME and restores the active index', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'ADD_FRAME' })
    expect(s.frames).toHaveLength(2)
    expect(s.activeFrame).toBe(1)
    s = reducer(s, { type: 'UNDO' })
    expect(s.frames).toHaveLength(1)
    expect(s.activeFrame).toBe(0)
  })

  it('UNDO reverses DUPLICATE_FRAME', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'DUPLICATE_FRAME' })
    expect(s.frames).toHaveLength(2)
    expect(reducer(s, { type: 'UNDO' }).frames).toHaveLength(1)
  })

  it('a structural frame change clears the redo stack', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'BEGIN_STROKE' })
    s = reducer(s, { type: 'PAINT_CELL', x: 0, y: 0, color: '#ff0000' })
    s = reducer(s, { type: 'UNDO' })
    expect(s.future.length).toBeGreaterThan(0)
    s = reducer(s, { type: 'ADD_FRAME' })
    expect(s.future).toHaveLength(0)
  })
})

// ── drawing + history ─────────────────────────────────────────────────────────

describe('drawing + history', () => {
  it('PAINT_CELL only mutates the active frame', () => {
    let s = makeState(2)
    s = reducer(s, { type: 'PAINT_CELL', x: 1, y: 1, color: '#00ff00' })
    expect(s.frames[0].layers[0].cells[1 * 4 + 1]).toBe('#00ff00')
    expect(s.frames[1].layers[0].cells[1 * 4 + 1]).toBe(null)
  })

  it('UNDO after a stroke restores the prior frame contents', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'BEGIN_STROKE' })
    s = reducer(s, { type: 'PAINT_CELL', x: 0, y: 0, color: '#ff0000' })
    expect(s.frames[0].layers[0].cells[0]).toBe('#ff0000')
    s = reducer(s, { type: 'UNDO' })
    expect(s.frames[0].layers[0].cells[0]).toBe(null)
  })
})

// ── paste destination ─────────────────────────────────────────────────────────

describe('paste destination', () => {
  it('pastes at canvas center when no selection exists', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'SET_SELECTION', rect: { x: 0, y: 0, width: 2, height: 2 } })
    s = reducer(s, { type: 'COPY_SELECTION' })
    s = reducer(s, { type: 'SET_SELECTION', rect: null })
    s = reducer(s, { type: 'PASTE_CLIPBOARD' })
    // 4x4 canvas, 2x2 clipboard → center = (1, 1)
    expect(s.selection?.x).toBe(1)
    expect(s.selection?.y).toBe(1)
  })

  it('CLEAR preserves the clipboard', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'BEGIN_STROKE' })
    s = reducer(s, { type: 'PAINT_CELL', x: 0, y: 0, color: '#ff0000' })
    s = reducer(s, { type: 'SET_SELECTION', rect: { x: 0, y: 0, width: 1, height: 1 } })
    s = reducer(s, { type: 'COPY_SELECTION' })
    expect(s.clipboard).not.toBeNull()
    s = reducer(s, { type: 'CLEAR' })
    expect(s.clipboard).not.toBeNull()
  })

  it('CLEAR_ALL resets the clipboard', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'SET_SELECTION', rect: { x: 0, y: 0, width: 1, height: 1 } })
    s = reducer(s, { type: 'COPY_SELECTION' })
    expect(s.clipboard).not.toBeNull()
    s = reducer(s, { type: 'CLEAR_ALL' })
    expect(s.clipboard).toBeNull()
  })
})

// ── selection paste clamps to canvas ─────────────────────────────────────────

describe('selection paste clamps to canvas', () => {
  it('clamps the resulting selection inside the grid', () => {
    let s = makeState(1)
    const frame = s.frames[0]
    const newCells = setCell({ width: 4, height: 4, cells: frame.layers[0].cells }, 0, 0, '#ffffff')
    s = {
      ...s,
      frames: [{
        ...frame,
        layers: [{ ...frame.layers[0], cells: newCells.cells }],
      }],
    }
    s = reducer(s, { type: 'SET_SELECTION', rect: { x: 0, y: 0, width: 2, height: 2 } })
    s = reducer(s, { type: 'COPY_SELECTION' })
    s = reducer(s, { type: 'SET_SELECTION', rect: { x: 3, y: 3, width: 2, height: 2 } })
    s = reducer(s, { type: 'PASTE_CLIPBOARD' })
    expect(s.selection).toEqual({ x: 3, y: 3, width: 1, height: 1 })
  })
})

// ── layer operations ──────────────────────────────────────────────────────────

describe('layer operations', () => {
  it('ADD_LAYER inserts above active and sets activeLayer', () => {
    let s = makeState(1)
    expect(s.frames[0].layers).toHaveLength(1)
    s = reducer(s, { type: 'ADD_LAYER' })
    expect(s.frames[0].layers).toHaveLength(2)
    expect(s.activeLayer).toBe(1)
  })

  it('REMOVE_LAYER decreases layer count', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'ADD_LAYER' })
    s = reducer(s, { type: 'REMOVE_LAYER' })
    expect(s.frames[0].layers).toHaveLength(1)
  })

  it('REMOVE_LAYER is a no-op when only one layer exists', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'REMOVE_LAYER' })
    expect(s.frames[0].layers).toHaveLength(1)
  })

  it('TOGGLE_LAYER_VISIBILITY flips visible flag', () => {
    let s = makeState(1)
    expect(s.frames[0].layers[0].meta.visible).toBe(true)
    s = reducer(s, { type: 'TOGGLE_LAYER_VISIBILITY', index: 0 })
    expect(s.frames[0].layers[0].meta.visible).toBe(false)
    s = reducer(s, { type: 'TOGGLE_LAYER_VISIBILITY', index: 0 })
    expect(s.frames[0].layers[0].meta.visible).toBe(true)
  })

  it('RENAME_LAYER updates the layer name', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'RENAME_LAYER', index: 0, name: 'Background' })
    expect(s.frames[0].layers[0].meta.name).toBe('Background')
  })

  it('SET_LAYER_OPACITY clamps to 0-255', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'SET_LAYER_OPACITY', index: 0, opacity: 128 })
    expect(s.frames[0].layers[0].meta.opacity).toBe(128)
    s = reducer(s, { type: 'SET_LAYER_OPACITY', index: 0, opacity: 999 })
    expect(s.frames[0].layers[0].meta.opacity).toBe(255)
  })

  it('REORDER_LAYER swaps two layers and updates activeLayer', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'ADD_LAYER' })  // now 2 layers, activeLayer=1
    s = reducer(s, { type: 'RENAME_LAYER', index: 0, name: 'A' })
    s = reducer(s, { type: 'RENAME_LAYER', index: 1, name: 'B' })
    s = reducer(s, { type: 'REORDER_LAYER', from: 1, to: 0 })
    expect(s.frames[0].layers[0].meta.name).toBe('B')
    expect(s.frames[0].layers[1].meta.name).toBe('A')
    expect(s.activeLayer).toBe(0)
  })

  it('PAINT_CELL writes to the active layer only', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'ADD_LAYER' })  // activeLayer=1
    s = reducer(s, { type: 'PAINT_CELL', x: 0, y: 0, color: '#ff0000' })
    expect(s.frames[0].layers[1].cells[0]).toBe('#ff0000')
    expect(s.frames[0].layers[0].cells[0]).toBeNull()
  })

  it('CLEAR wipes only the active layer', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'BEGIN_STROKE' })
    s = reducer(s, { type: 'PAINT_CELL', x: 0, y: 0, color: '#ff0000' })
    s = reducer(s, { type: 'ADD_LAYER' })  // activeLayer=1
    s = reducer(s, { type: 'PAINT_CELL', x: 1, y: 0, color: '#0000ff' })
    s = reducer(s, { type: 'SET_ACTIVE_LAYER', index: 1 })
    s = reducer(s, { type: 'CLEAR' })
    expect(s.frames[0].layers[1].cells[1]).toBeNull()
    expect(s.frames[0].layers[0].cells[0]).toBe('#ff0000')
  })
})

// ── swatch cap ────────────────────────────────────────────────────────────────

describe('swatch cap', () => {
  it('ADD_SWATCH does not exceed 64 swatches', () => {
    let s = makeState(1)
    // Add 64 distinct swatches
    for (let i = 0; i < 64; i++) {
      const hex = `#${i.toString(16).padStart(6, '0')}`
      s = reducer(s, { type: 'ADD_SWATCH', color: hex })
    }
    expect(s.swatches).toHaveLength(64)
    // A 65th swatch should be silently ignored
    s = reducer(s, { type: 'ADD_SWATCH', color: '#ffffff' })
    expect(s.swatches).toHaveLength(64)
  })
})

// ── color actions ─────────────────────────────────────────────────────────────

describe('color actions', () => {
  it('SET_COLOR updates foregroundColor without pushing history', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'SET_COLOR', color: '#aabbcc' })
    expect(s.foregroundColor).toBe('#aabbcc')
    expect(s.past).toHaveLength(0)
  })

  it('SET_BACKGROUND_COLOR updates backgroundColor', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'SET_BACKGROUND_COLOR', color: '#112233' })
    expect(s.backgroundColor).toBe('#112233')
  })

  it('SWAP_COLORS exchanges foreground and background', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'SET_COLOR', color: '#ff0000' })
    s = reducer(s, { type: 'SET_BACKGROUND_COLOR', color: '#0000ff' })
    s = reducer(s, { type: 'SWAP_COLORS' })
    expect(s.foregroundColor).toBe('#0000ff')
    expect(s.backgroundColor).toBe('#ff0000')
  })

  it('RESET_COLORS restores black/white defaults without pushing history', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'SET_COLOR', color: '#ff0000' })
    s = reducer(s, { type: 'SET_BACKGROUND_COLOR', color: '#00ff00' })
    s = reducer(s, { type: 'RESET_COLORS' })
    expect(s.foregroundColor).toBe('#000000')
    expect(s.backgroundColor).toBe('#ffffff')
    expect(s.past).toHaveLength(0)
  })

  it('ADD_SWATCH with a duplicate color returns the same state reference', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'ADD_SWATCH', color: '#ff0000' })
    expect(reducer(s, { type: 'ADD_SWATCH', color: '#ff0000' })).toBe(s)
  })

  it('REMOVE_SWATCH removes only the matching swatch', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'ADD_SWATCH', color: '#ff0000' })
    s = reducer(s, { type: 'ADD_SWATCH', color: '#00ff00' })
    s = reducer(s, { type: 'ADD_SWATCH', color: '#0000ff' })
    s = reducer(s, { type: 'REMOVE_SWATCH', color: '#00ff00' })
    expect(s.swatches).toEqual(['#ff0000', '#0000ff'])
  })
})

// ── zoom ──────────────────────────────────────────────────────────────────────

describe('zoom', () => {
  it('SET_ZOOM clamps to minimum 2', () => {
    expect(reducer(makeState(1), { type: 'SET_ZOOM', zoom: 0 }).zoom).toBe(2)
  })

  it('SET_ZOOM clamps to maximum 256', () => {
    expect(reducer(makeState(1), { type: 'SET_ZOOM', zoom: 9999 }).zoom).toBe(256)
  })

  it('ZOOM_BY increases zoom by the delta', () => {
    // default zoom is 16
    expect(reducer(makeState(1), { type: 'ZOOM_BY', delta: 4 }).zoom).toBe(20)
  })

  it('ZOOM_BY clamps at both ends', () => {
    expect(reducer(makeState(1), { type: 'ZOOM_BY', delta: -9999 }).zoom).toBe(2)
    expect(reducer(makeState(1), { type: 'ZOOM_BY', delta: 9999 }).zoom).toBe(256)
  })
})

// ── tool and canvas reset ─────────────────────────────────────────────────────

describe('tool and canvas reset', () => {
  it('SET_TOOL updates the active tool', () => {
    expect(reducer(makeState(1), { type: 'SET_TOOL', tool: 'fill' }).tool).toBe('fill')
  })

  it('NEW_CANVAS resets to a single blank frame and clears all history', () => {
    let s = makeState(3)
    s = reducer(s, { type: 'BEGIN_STROKE' })
    s = reducer(s, { type: 'PAINT_CELL', x: 0, y: 0, color: '#ff0000' })
    s = reducer(s, { type: 'NEW_CANVAS', size: 8 })
    expect(s.frames).toHaveLength(1)
    expect(s.frames[0].width).toBe(8)
    expect(s.frames[0].height).toBe(8)
    expect(s.activeFrame).toBe(0)
    expect(s.activeLayer).toBe(0)
    expect(s.past).toHaveLength(0)
    expect(s.future).toHaveLength(0)
    expect(s.selection).toBeNull()
    expect(s.clipboard).toBeNull()
  })

  it('LOAD_FRAMES replaces all frames and clears history', () => {
    let s = makeState(3)
    s = reducer(s, { type: 'BEGIN_STROKE' })
    const newFrames = [makeFrame(8, 8), makeFrame(8, 8)]
    s = reducer(s, { type: 'LOAD_FRAMES', frames: newFrames })
    expect(s.frames).toHaveLength(2)
    expect(s.frames[0].width).toBe(8)
    expect(s.activeFrame).toBe(0)
    expect(s.past).toHaveLength(0)
    expect(s.future).toHaveLength(0)
  })

  it('SET_ACTIVE_FRAME clamps to valid range', () => {
    const s = makeState(3)
    expect(reducer(s, { type: 'SET_ACTIVE_FRAME', index: -1 }).activeFrame).toBe(0)
    expect(reducer(s, { type: 'SET_ACTIVE_FRAME', index: 10 }).activeFrame).toBe(2)
    expect(reducer(s, { type: 'SET_ACTIVE_FRAME', index: 1 }).activeFrame).toBe(1)
  })
})

// ── selection operations ──────────────────────────────────────────────────────

describe('selection operations', () => {
  it('DELETE_SELECTION nulls cells within the selection and pushes history', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'PAINT_CELL', x: 0, y: 0, color: '#ff0000' })
    s = reducer(s, { type: 'PAINT_CELL', x: 1, y: 0, color: '#ff0000' })
    s = reducer(s, { type: 'PAINT_CELL', x: 2, y: 0, color: '#ff0000' })
    s = reducer(s, { type: 'SET_SELECTION', rect: { x: 0, y: 0, width: 2, height: 1 } })
    s = reducer(s, { type: 'DELETE_SELECTION' })
    const cells = s.frames[0].layers[0].cells
    expect(cells[0]).toBeNull()
    expect(cells[1]).toBeNull()
    expect(cells[2]).toBe('#ff0000') // outside selection, untouched
    expect(s.past).toHaveLength(1)
  })

  it('DELETE_SELECTION with no selection is a no-op', () => {
    const s = makeState(1)
    expect(reducer(s, { type: 'DELETE_SELECTION' })).toBe(s)
  })

  it('FLOOD_FILL is clipped to the active selection', () => {
    let s = makeState(1) // 4x4 blank canvas
    s = reducer(s, { type: 'SET_SELECTION', rect: { x: 1, y: 1, width: 2, height: 2 } })
    s = reducer(s, { type: 'FLOOD_FILL', x: 1, y: 1, color: '#ff0000' })
    const cells = s.frames[0].layers[0].cells
    // inside selection
    expect(cells[1 * 4 + 1]).toBe('#ff0000')
    expect(cells[1 * 4 + 2]).toBe('#ff0000')
    expect(cells[2 * 4 + 1]).toBe('#ff0000')
    expect(cells[2 * 4 + 2]).toBe('#ff0000')
    // outside selection
    expect(cells[0]).toBeNull()
    expect(cells[3 * 4 + 3]).toBeNull()
  })

  it('COPY_SELECTION populates clipboard with the selected region', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'PAINT_CELL', x: 0, y: 0, color: '#ff0000' })
    s = reducer(s, { type: 'PAINT_CELL', x: 1, y: 0, color: '#00ff00' })
    s = reducer(s, { type: 'SET_SELECTION', rect: { x: 0, y: 0, width: 2, height: 1 } })
    s = reducer(s, { type: 'COPY_SELECTION' })
    expect(s.clipboard).not.toBeNull()
    expect(s.clipboard!.width).toBe(2)
    expect(s.clipboard!.height).toBe(1)
    expect(s.clipboard!.cells[0]).toBe('#ff0000')
    expect(s.clipboard!.cells[1]).toBe('#00ff00')
  })

  it('COPY_SELECTION with no selection is a no-op', () => {
    const s = makeState(1)
    expect(reducer(s, { type: 'COPY_SELECTION' })).toBe(s)
  })
})

// ── END_STROKE history cleanup ────────────────────────────────────────────────

describe('END_STROKE history cleanup', () => {
  it('discards the BEGIN_STROKE entry when the stroke changed nothing', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'PAINT_CELL', x: 0, y: 0, color: '#ff0000' })
    s = reducer(s, { type: 'BEGIN_STROKE' })
    // FLOOD_FILL with the same color already in that cell — no pixels change
    s = reducer(s, { type: 'FLOOD_FILL', x: 0, y: 0, color: '#ff0000' })
    expect(s.past).toHaveLength(1)
    s = reducer(s, { type: 'END_STROKE' })
    expect(s.past).toHaveLength(0)
  })

  it('keeps the BEGIN_STROKE entry when the stroke changed pixels', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'BEGIN_STROKE' })
    s = reducer(s, { type: 'PAINT_CELL', x: 0, y: 0, color: '#ff0000' })
    expect(s.past).toHaveLength(1)
    s = reducer(s, { type: 'END_STROKE' })
    expect(s.past).toHaveLength(1)
  })
})

// ── layer operation gaps ──────────────────────────────────────────────────────

describe('layer operation gaps', () => {
  it('DUPLICATE_LAYER inserts a copy above the active layer with independent cells', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'PAINT_CELL', x: 0, y: 0, color: '#ff0000' })
    s = reducer(s, { type: 'DUPLICATE_LAYER' })
    expect(s.frames[0].layers).toHaveLength(2)
    expect(s.activeLayer).toBe(1)
    expect(s.frames[0].layers[1].cells[0]).toBe('#ff0000') // content copied
    expect(s.frames[0].layers[0].cells).not.toBe(s.frames[0].layers[1].cells) // independent arrays
  })

  it('MERGE_DOWN composites upper onto lower and decrements activeLayer', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'PAINT_CELL', x: 0, y: 0, color: '#ff0000' })
    s = reducer(s, { type: 'ADD_LAYER' }) // layer 1 is now active
    s = reducer(s, { type: 'PAINT_CELL', x: 1, y: 0, color: '#0000ff' })
    s = reducer(s, { type: 'MERGE_DOWN' })
    expect(s.frames[0].layers).toHaveLength(1)
    expect(s.activeLayer).toBe(0)
    expect(s.frames[0].layers[0].cells[0]).toBe('#ff0000') // from lower layer
    expect(s.frames[0].layers[0].cells[1]).toBe('#0000ff') // from upper layer
  })

  it('MERGE_DOWN at the bottom layer is a no-op', () => {
    const s = makeState(1)
    expect(reducer(s, { type: 'MERGE_DOWN' })).toBe(s)
  })

  it('FLATTEN_LAYERS merges all layers into one composited layer', () => {
    let s = makeState(1)
    s = reducer(s, { type: 'PAINT_CELL', x: 0, y: 0, color: '#ff0000' })
    s = reducer(s, { type: 'ADD_LAYER' }) // layer 1 is now active
    s = reducer(s, { type: 'PAINT_CELL', x: 1, y: 0, color: '#0000ff' })
    s = reducer(s, { type: 'FLATTEN_LAYERS' })
    expect(s.frames[0].layers).toHaveLength(1)
    expect(s.activeLayer).toBe(0)
    expect(s.frames[0].layers[0].cells[0]).toBe('#ff0000')
    expect(s.frames[0].layers[0].cells[1]).toBe('#0000ff')
  })

  it('FLATTEN_LAYERS on a single layer is a no-op', () => {
    const s = makeState(1)
    expect(reducer(s, { type: 'FLATTEN_LAYERS' })).toBe(s)
  })

  it('CLEAR_ALL resets to a single blank frame and clears the redo stack', () => {
    let s = makeState(2)
    s = reducer(s, { type: 'BEGIN_STROKE' })
    s = reducer(s, { type: 'PAINT_CELL', x: 0, y: 0, color: '#ff0000' })
    s = reducer(s, { type: 'UNDO' }) // puts something in future
    s = reducer(s, { type: 'CLEAR_ALL' })
    expect(s.frames).toHaveLength(1)
    expect(s.frames[0].layers[0].cells.every(c => c === null)).toBe(true)
    expect(s.activeFrame).toBe(0)
    expect(s.activeLayer).toBe(0)
    expect(s.future).toHaveLength(0)
    expect(s.clipboard).toBeNull()
  })
})
