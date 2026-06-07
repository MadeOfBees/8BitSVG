import { describe, expect, it } from 'vitest'
import { toAseBuffer } from './ase-writer'
import { applyBlend, parseAseFile } from './aseprite'
import { compositeFrame } from './compose'
import type { FrameData } from '../types'

// ── helpers ───────────────────────────────────────────────────────────────────

function singleLayer(width: number, height: number, cells: (string | null)[]): FrameData {
  return {
    width,
    height,
    layers: [{
      meta: { id: 'l0', name: 'Layer 1', visible: true, opacity: 255, blendMode: 0 },
      cells,
    }],
  }
}

// ── round-trip (opaque, regression guard) ────────────────────────────────────

describe('ASE write → parse round-trip', () => {
  it('preserves a single-frame 2x2 sprite', async () => {
    const f = singleLayer(2, 2, ['#ff0000', null, null, '#0000ff'])
    const buf = toAseBuffer([f])
    const out = await parseAseFile(buf.buffer.slice(0))
    expect(out).toHaveLength(1)
    expect(out[0].layers[0].cells).toEqual(f.layers[0].cells)
  })

  it('preserves a two-frame sprite', async () => {
    const f1 = singleLayer(2, 2, ['#ff0000', null, null, '#0000ff'])
    const f2 = singleLayer(2, 2, [null, '#00ff00', '#00ff00', null])
    const buf = toAseBuffer([f1, f2])
    const out = await parseAseFile(buf.buffer.slice(0))
    expect(out).toHaveLength(2)
    expect(out[0].layers[0].cells).toEqual(f1.layers[0].cells)
    expect(out[1].layers[0].cells).toEqual(f2.layers[0].cells)
  })

  it('preserves a non-square sprite with full opacity', async () => {
    const f = singleLayer(3, 2, ['#112233', '#445566', null, null, '#778899', '#aabbcc'])
    const out = await parseAseFile(toAseBuffer([f]).buffer.slice(0))
    expect(out[0].layers[0].cells).toEqual(f.layers[0].cells)
  })

  it('preserves layer name and opacity', async () => {
    const f: FrameData = {
      width: 1, height: 1,
      layers: [{
        meta: { id: 'l0', name: 'Background', visible: true, opacity: 200, blendMode: 0 },
        cells: ['#ff0000'],
      }],
    }
    const out = await parseAseFile(toAseBuffer([f]).buffer.slice(0))
    expect(out[0].layers[0].meta.name).toBe('Background')
    expect(out[0].layers[0].meta.opacity).toBe(200)
  })

  it('round-trips two layers', async () => {
    const f: FrameData = {
      width: 1, height: 1,
      layers: [
        { meta: { id: 'l0', name: 'Base', visible: true, opacity: 255, blendMode: 0 }, cells: ['#ff0000'] },
        { meta: { id: 'l1', name: 'Top', visible: true, opacity: 128, blendMode: 0 }, cells: ['#0000ff'] },
      ],
    }
    const out = await parseAseFile(toAseBuffer([f]).buffer.slice(0))
    expect(out[0].layers).toHaveLength(2)
    expect(out[0].layers[0].meta.name).toBe('Base')
    expect(out[0].layers[1].meta.name).toBe('Top')
  })
})

// ── semi-transparency round-trip ─────────────────────────────────────────────

describe('semi-transparency round-trip', () => {
  it('preserves 50% alpha on a pixel', async () => {
    const f = singleLayer(1, 1, ['#ff000080'])
    const out = await parseAseFile(toAseBuffer([f]).buffer.slice(0))
    expect(out[0].layers[0].cells[0]).toBe('#ff000080')
  })

  it('preserves opaque pixels as 7-char #rrggbb (no alpha suffix)', async () => {
    const f = singleLayer(1, 1, ['#123456'])
    const out = await parseAseFile(toAseBuffer([f]).buffer.slice(0))
    expect(out[0].layers[0].cells[0]).toBe('#123456')
  })

  it('emits null when alpha byte is zeroed in raw pixel data', async () => {
    const f = singleLayer(1, 1, ['#ff0000'])
    const raw = new Uint8Array(toAseBuffer([f]).buffer.slice(0))
    raw[raw.length - 1] = 0
    const out = await parseAseFile(raw.buffer)
    expect(out[0].layers[0].cells[0]).toBeNull()
  })

  it('round-trips multiple alpha levels', async () => {
    const cells = ['#ff000001', '#ff000040', '#ff000080', '#ff0000bf', '#ff0000ff']
    for (const c of cells) {
      const f = singleLayer(1, 1, [c])
      const out = await parseAseFile(toAseBuffer([f]).buffer.slice(0))
      expect(out[0].layers[0].cells[0]).toBe(c === '#ff0000ff' ? '#ff0000' : c)
    }
  })
})

// ── blend modes ───────────────────────────────────────────────────────────────

describe('applyBlend', () => {
  it('Normal (0): returns source', () => {
    expect(applyBlend(0, 100, 100, 100, 200, 200, 200)).toEqual([100, 100, 100])
  })

  it('Multiply (1): floor(100x200/255) = 78', () => {
    const [r] = applyBlend(1, 100, 0, 0, 200, 0, 0)
    expect(r).toBe(78)
  })

  it('Screen (2): 255 - floor(155x55/255) = 222', () => {
    const [r] = applyBlend(2, 100, 0, 0, 200, 0, 0)
    expect(r).toBe(222)
  })

  it('Overlay (3): dst≥128 — 255 - floor(2x155x55/255) = 189', () => {
    const [r] = applyBlend(3, 100, 0, 0, 200, 0, 0)
    expect(r).toBe(189)
  })

  it('Overlay (3): dst<128 — floor(2x100x50/255) = 39', () => {
    const [r] = applyBlend(3, 100, 0, 0, 50, 0, 0)
    expect(r).toBe(39)
  })

  it('Darken (4): min(100, 200) = 100', () => {
    const [r] = applyBlend(4, 100, 0, 0, 200, 0, 0)
    expect(r).toBe(100)
  })

  it('Lighten (5): max(100, 200) = 200', () => {
    const [r] = applyBlend(5, 100, 0, 0, 200, 0, 0)
    expect(r).toBe(200)
  })

  it('Color Dodge (6): src=255 clamps to 255', () => {
    expect(applyBlend(6, 255, 0, 0, 128, 0, 0)[0]).toBe(255)
  })

  it('Color Dodge (6): src=0 dst unchanged', () => {
    expect(applyBlend(6, 0, 0, 0, 128, 0, 0)[0]).toBe(128)
  })

  it('Color Burn (7): src=0 clamps to 0', () => {
    expect(applyBlend(7, 0, 0, 0, 128, 0, 0)[0]).toBe(0)
  })

  it('Color Burn (7): src=255 dst unchanged', () => {
    expect(applyBlend(7, 255, 0, 0, 128, 0, 0)[0]).toBe(128)
  })

  it('Hard Light (8): src<128 uses Overlay dst-branch formula', () => {
    expect(applyBlend(8, 50, 0, 0, 200, 0, 0)[0]).toBe(78)
  })

  it('Soft Light (9): src=100 dst=200 → 190', () => {
    expect(applyBlend(9, 100, 0, 0, 200, 0, 0)[0]).toBe(190)
  })

  it('Soft Light (9): stays in [0,255] for extreme inputs', () => {
    for (const [s, d] of [[0, 0], [255, 255], [255, 0], [0, 255]] as const) {
      const [r] = applyBlend(9, s, 0, 0, d, 0, 0)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(255)
    }
  })

  it('Difference (10): abs(100-200) = 100', () => {
    expect(applyBlend(10, 100, 0, 0, 200, 0, 0)[0]).toBe(100)
  })

  it('Exclusion (11): floor(100+200-2x100x200/255) = 143', () => {
    expect(applyBlend(11, 100, 0, 0, 200, 0, 0)[0]).toBe(143)
  })

  it('Addition (16): min(255, 100+200) = 255', () => {
    expect(applyBlend(16, 100, 0, 0, 200, 0, 0)[0]).toBe(255)
  })

  it('Subtract (17): max(0, 200-100) = 100', () => {
    expect(applyBlend(17, 100, 0, 0, 200, 0, 0)[0]).toBe(100)
  })

  it('Divide (18): src=0 → 255', () => {
    expect(applyBlend(18, 0, 0, 0, 128, 0, 0)[0]).toBe(255)
  })

  it('Divide (18): floor(200x255/100)=510 clamped to 255', () => {
    expect(applyBlend(18, 100, 0, 0, 200, 0, 0)[0]).toBe(255)
  })

  it('Hue (12): result has src hue, dst sat+lum', () => {
    const [r, g, b] = applyBlend(12, 255, 0, 0, 0, 255, 0)
    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
  })

  it('Luminosity (15): black src over white dst → dark result', () => {
    const [r, g, b] = applyBlend(15, 0, 0, 0, 255, 255, 255)
    expect(r).toBeLessThan(128)
    expect(g).toBeLessThan(128)
    expect(b).toBeLessThan(128)
  })

  it('unknown mode falls back to Normal', () => {
    expect(applyBlend(99, 42, 42, 42, 200, 200, 200)).toEqual([42, 42, 42])
  })
})

// ── compositeFrame ────────────────────────────────────────────────────────────

describe('compositeFrame', () => {
  it('single opaque layer — cells pass through unchanged', () => {
    const f = singleLayer(2, 2, ['#ff0000', null, null, '#0000ff'])
    const out = compositeFrame(f)
    expect(out.cells).toEqual(['#ff0000', null, null, '#0000ff'])
  })

  it('hidden layer is excluded from composite', () => {
    const f: FrameData = {
      width: 1, height: 1,
      layers: [
        { meta: { id: 'l0', name: 'Base', visible: true, opacity: 255, blendMode: 0 }, cells: ['#ff0000'] },
        { meta: { id: 'l1', name: 'Top', visible: false, opacity: 255, blendMode: 0 }, cells: ['#0000ff'] },
      ],
    }
    expect(compositeFrame(f).cells[0]).toBe('#ff0000')
  })

  it('fully opaque top layer covers bottom', () => {
    const f: FrameData = {
      width: 1, height: 1,
      layers: [
        { meta: { id: 'l0', name: 'Base', visible: true, opacity: 255, blendMode: 0 }, cells: ['#ff0000'] },
        { meta: { id: 'l1', name: 'Top', visible: true, opacity: 255, blendMode: 0 }, cells: ['#0000ff'] },
      ],
    }
    expect(compositeFrame(f).cells[0]).toBe('#0000ff')
  })
})

// ── SVG fill-opacity for semi-transparent cells ───────────────────────────────

describe('svg fill-opacity', () => {
  it('emits fill-opacity for 9-char hex cells', async () => {
    const { toSvgString } = await import('./svg')
    const grid = compositeFrame(singleLayer(1, 1, ['#ff000080']))
    const svg = toSvgString(grid, { x: 0, y: 0, width: 1, height: 1 })
    expect(svg).toContain('fill="#ff0000"')
    expect(svg).toContain('fill-opacity="0.502"')
  })

  it('does not emit fill-opacity for fully opaque cells', async () => {
    const { toSvgString } = await import('./svg')
    const grid = compositeFrame(singleLayer(1, 1, ['#ff0000']))
    const svg = toSvgString(grid, { x: 0, y: 0, width: 1, height: 1 })
    expect(svg).not.toContain('fill-opacity')
  })

  it('fmtOpacity: 20% alpha → 0.2', async () => {
    const { toSvgString } = await import('./svg')
    const grid = compositeFrame(singleLayer(1, 1, ['#ffffff33']))
    const svg = toSvgString(grid, { x: 0, y: 0, width: 1, height: 1 })
    expect(svg).toContain('fill-opacity="0.2"')
  })

  it('React output emits fillOpacity prop', async () => {
    const { toReactComponent } = await import('./svg')
    const grid = compositeFrame(singleLayer(1, 1, ['#ff000080']))
    const tsx = toReactComponent(grid, { x: 0, y: 0, width: 1, height: 1 })
    expect(tsx).toContain('fill="#ff0000"')
    expect(tsx).toContain('fillOpacity={0.502}')
  })
})

// ── malformed input ───────────────────────────────────────────────────────────

describe('parseAseFile rejects malformed input', () => {
  it('throws a readable error on wrong magic number', async () => {
    const buf = new ArrayBuffer(128)
    const view = new DataView(buf)
    view.setUint16(4, 0xdead, true) // wrong magic (should be 0xa5e0)
    await expect(parseAseFile(buf)).rejects.toThrow(/not an ase file/i)
  })

  it('throws on a zero-byte buffer', async () => {
    await expect(parseAseFile(new ArrayBuffer(0))).rejects.toThrow()
  })
})
