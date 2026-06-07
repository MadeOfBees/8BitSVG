import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadProject, saveProject } from './storage'

const KEY = '8bitsvg:project'

function stubLocalStorage() {
  const store: Record<string, string> = {}
  globalThis.localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { for (const k of Object.keys(store)) delete store[k] },
    key: () => null,
    length: 0,
  } as Storage
}

function frameData(w = 2, h = 2) {
  return {
    width: w, height: h,
    layers: [{
      meta: { id: 'l0', name: 'Layer 1', visible: true, opacity: 255, blendMode: 0 },
      cells: new Array(w * h).fill(null),
    }],
  }
}

beforeEach(stubLocalStorage)

describe('loadProject', () => {
  it('returns null when nothing is stored', () => {
    expect(loadProject()).toBe(null)
  })

  it('clamps an out-of-range activeFrame to the last frame', () => {
    localStorage.setItem(KEY, JSON.stringify({
      frames: [frameData(), frameData()], activeFrame: 9, swatches: [], activeColor: '#000000',
    }))
    expect(loadProject()!.activeFrame).toBe(1)
  })

  it('clamps a negative activeFrame to 0', () => {
    localStorage.setItem(KEY, JSON.stringify({
      frames: [frameData()], activeFrame: -3, swatches: [], activeColor: '#000000',
    }))
    expect(loadProject()!.activeFrame).toBe(0)
  })

  it('returns null for the legacy single-grid shape (no migration)', () => {
    localStorage.setItem(KEY, JSON.stringify({
      grid: { width: 2, height: 2, cells: new Array(4).fill(null) },
      swatches: ['#ffffff'], activeColor: '#123456',
    }))
    expect(loadProject()).toBe(null)
  })

  it('rejects a payload whose frames are not valid grids', () => {
    localStorage.setItem(KEY, JSON.stringify({
      frames: [{ width: 2, height: 2, cells: [null] }], activeFrame: 0,
    }))
    expect(loadProject()).toBe(null)
  })

  it('rejects malformed JSON', () => {
    localStorage.setItem(KEY, '{not json')
    expect(loadProject()).toBe(null)
  })

  it('drops non-hex swatches on load, keeping valid ones', () => {
    localStorage.setItem(KEY, JSON.stringify({
      frames: [frameData()], activeFrame: 0,
      swatches: ['#ffffff', 'red', '#fff', 123, '#00ff00'], activeColor: '#000000',
    }))
    expect(loadProject()!.swatches).toEqual(['#ffffff', '#00ff00'])
  })

  it('keeps 8-digit RGBA swatches on load', () => {
    localStorage.setItem(KEY, JSON.stringify({
      frames: [frameData()], activeFrame: 0,
      swatches: ['#ff000080', '#00ff00ff', '#ffffff'], activeColor: '#000000',
    }))
    expect(loadProject()!.swatches).toEqual(['#ff000080', '#00ff00ff', '#ffffff'])
  })

  it('rejects a payload with corrupted layer structure (missing meta/cells)', () => {
    localStorage.setItem(KEY, JSON.stringify({
      frames: [{ width: 2, height: 2, layers: [{ broken: true }] }], activeFrame: 0,
    }))
    expect(loadProject()).toBe(null)
  })

  it('rejects a payload with more than 500 frames', () => {
    const frames = Array.from({ length: 501 }, () => frameData())
    localStorage.setItem(KEY, JSON.stringify({ frames, activeFrame: 0, swatches: [] }))
    expect(loadProject()).toBe(null)
  })

  it('caps swatches at 64 on load', () => {
    const swatches = Array.from({ length: 80 }, (_, i) => `#${i.toString(16).padStart(6, '0')}`)
    localStorage.setItem(KEY, JSON.stringify({ frames: [frameData()], activeFrame: 0, swatches }))
    expect(loadProject()!.swatches).toHaveLength(64)
  })
})

describe('saveProject', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('full round-trip: saved fields are returned by loadProject', () => {
    const project = {
      frames: [frameData()],
      activeFrame: 0,
      activeLayer: 0,
      swatches: ['#ff0000', '#00ff00'],
      foregroundColor: '#123456',
      backgroundColor: '#abcdef',
    }
    saveProject(project)
    vi.runAllTimers()
    const loaded = loadProject()
    expect(loaded).not.toBeNull()
    expect(loaded!.foregroundColor).toBe('#123456')
    expect(loaded!.backgroundColor).toBe('#abcdef')
    expect(loaded!.swatches).toEqual(['#ff0000', '#00ff00'])
    expect(loaded!.frames).toHaveLength(1)
  })

  it('rapid saves: only the last call before the timer fires is persisted', () => {
    const p1 = { frames: [frameData()], activeFrame: 0, activeLayer: 0, swatches: [], foregroundColor: '#111111', backgroundColor: '#ffffff' }
    const p2 = { frames: [frameData()], activeFrame: 0, activeLayer: 0, swatches: [], foregroundColor: '#222222', backgroundColor: '#ffffff' }
    saveProject(p1)
    saveProject(p2)
    vi.runAllTimers()
    expect(loadProject()!.foregroundColor).toBe('#222222')
  })

  it('swatches exceeding 64 are capped on load', () => {
    const swatches = Array.from({ length: 70 }, (_, i) => `#${i.toString(16).padStart(6, '0')}`)
    saveProject({ frames: [frameData()], activeFrame: 0, activeLayer: 0, swatches, foregroundColor: '#000000', backgroundColor: '#ffffff' })
    vi.runAllTimers()
    expect(loadProject()!.swatches).toHaveLength(64)
  })
})
