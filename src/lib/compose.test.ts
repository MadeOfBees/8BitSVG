import { describe, expect, it } from 'vitest'
import { compositeFrame } from './compose'
import type { FrameData, LayerMeta } from '../types'

function baseMeta(overrides?: Partial<LayerMeta>): LayerMeta {
  return { id: 'l0', name: 'Layer 1', visible: true, opacity: 255, blendMode: 0, ...overrides }
}

function singleLayer(w: number, h: number, color: string | null, meta?: Partial<LayerMeta>): FrameData {
  return {
    width: w, height: h,
    layers: [{ meta: baseMeta(meta), cells: new Array(w * h).fill(color) }],
  }
}

function twoLayer(
  w: number, h: number,
  botCells: (string | null)[],
  topCells: (string | null)[],
  topMeta?: Partial<LayerMeta>,
): FrameData {
  return {
    width: w, height: h,
    layers: [
      { meta: baseMeta(), cells: botCells },
      { meta: baseMeta({ id: 'l1', name: 'Layer 2', ...topMeta }), cells: topCells },
    ],
  }
}

describe('compositeFrame', () => {
  describe('multi-layer ordering', () => {
    it('single opaque layer is returned as-is', () => {
      const out = compositeFrame(singleLayer(2, 1, '#ff0000'))
      expect(out.cells).toEqual(['#ff0000', '#ff0000'])
    })

    it('two opaque layers: top wins over bottom', () => {
      expect(compositeFrame(twoLayer(1, 1, ['#ff0000'], ['#0000ff'])).cells[0]).toBe('#0000ff')
    })

    it('three layers composite bottom-to-top, each pixel takes the topmost non-null value', () => {
      const f: FrameData = {
        width: 3, height: 1,
        layers: [
          { meta: baseMeta(),                                  cells: ['#ff0000', '#ff0000', '#ff0000'] },
          { meta: baseMeta({ id: 'l1', name: 'Layer 2' }),    cells: [null,      '#00ff00', null      ] },
          { meta: baseMeta({ id: 'l2', name: 'Layer 3' }),    cells: [null,      null,      '#0000ff' ] },
        ],
      }
      const out = compositeFrame(f)
      expect(out.cells[0]).toBe('#ff0000') // only bottom
      expect(out.cells[1]).toBe('#00ff00') // middle wins
      expect(out.cells[2]).toBe('#0000ff') // top wins
    })
  })

  describe('alpha compositing', () => {
    it('semi-transparent source over opaque destination blends both channels', () => {
      const cell = compositeFrame(twoLayer(1, 1, ['#ff0000'], ['#0000ff80'])).cells[0] as string
      const r = parseInt(cell.slice(1, 3), 16)
      const b = parseInt(cell.slice(5, 7), 16)
      expect(r).toBeGreaterThan(0)
      expect(b).toBeGreaterThan(0)
      expect(cell).not.toBe('#ff0000')
      expect(cell).not.toBe('#0000ff')
    })

    it('zero-alpha source pixel is skipped, leaving the destination unchanged', () => {
      expect(compositeFrame(twoLayer(1, 1, ['#ff0000'], ['#0000ff00'])).cells[0]).toBe('#ff0000')
    })

    it('all-null layers produce all-null output', () => {
      expect(compositeFrame(twoLayer(2, 1, [null, null], [null, null])).cells).toEqual([null, null])
    })
  })

  describe('per-layer opacity', () => {
    it('layer at half opacity blends rather than fully covering the layer below', () => {
      const cell = compositeFrame(twoLayer(1, 1, ['#ff0000'], ['#0000ff'], { opacity: 127 })).cells[0] as string
      const r = parseInt(cell.slice(1, 3), 16)
      const b = parseInt(cell.slice(5, 7), 16)
      expect(r).toBeGreaterThan(0)
      expect(b).toBeGreaterThan(0)
    })

    it('layer at opacity 0 is completely invisible', () => {
      expect(compositeFrame(twoLayer(1, 1, ['#ff0000'], ['#0000ff'], { opacity: 0 })).cells[0]).toBe('#ff0000')
    })
  })

  describe('blend modes through compositing', () => {
    it('Normal (0): two opaque layers — top color is the result', () => {
      expect(compositeFrame(twoLayer(1, 1, ['#808080'], ['#808080'], { blendMode: 0 })).cells[0]).toBe('#808080')
    })

    it('Multiply (1): two mid-gray layers produce a result darker than either input', () => {
      const cell = compositeFrame(twoLayer(1, 1, ['#808080'], ['#808080'], { blendMode: 1 })).cells[0] as string
      expect(parseInt(cell.slice(1, 3), 16)).toBeLessThan(0x80)
    })

    it('Screen (2): two mid-gray layers produce a result lighter than either input', () => {
      const cell = compositeFrame(twoLayer(1, 1, ['#808080'], ['#808080'], { blendMode: 2 })).cells[0] as string
      expect(parseInt(cell.slice(1, 3), 16)).toBeGreaterThan(0x80)
    })

    it('Difference (10): identical-color layers cancel to black', () => {
      expect(compositeFrame(twoLayer(1, 1, ['#808080'], ['#808080'], { blendMode: 10 })).cells[0]).toBe('#000000')
    })
  })

  describe('hidden layers', () => {
    it('hidden layer in the middle is excluded from the composite', () => {
      const f: FrameData = {
        width: 1, height: 1,
        layers: [
          { meta: baseMeta(),                                               cells: ['#ff0000'] },
          { meta: baseMeta({ id: 'l1', name: 'Layer 2', visible: false }), cells: ['#00ff00'] },
          { meta: baseMeta({ id: 'l2', name: 'Layer 3' }),                 cells: [null]      },
        ],
      }
      expect(compositeFrame(f).cells[0]).toBe('#ff0000')
    })
  })

  describe('edge cases', () => {
    it('all-null single layer produces all-null output', () => {
      expect(compositeFrame(singleLayer(3, 3, null)).cells.every(c => c === null)).toBe(true)
    })

    it('1×1 single-pixel canvas round-trips correctly', () => {
      const out = compositeFrame(singleLayer(1, 1, '#abcdef'))
      expect(out.width).toBe(1)
      expect(out.height).toBe(1)
      expect(out.cells[0]).toBe('#abcdef')
    })
  })
})
