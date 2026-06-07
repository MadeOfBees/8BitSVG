import { applyBlend } from './aseprite'
import type { Cell, FrameData, Grid } from '../types'

/**
 * Composite all visible layers of a frame bottom-to-top using Normal blend +
 * Porter-Duff alpha-over with per-layer opacity. Returns a flat Grid for the
 * canvas renderer and svg.ts export path.
 */
export function compositeFrame(frame: FrameData): Grid {
  const { width, height } = frame
  const n = width * height

  const outR = new Uint8Array(n)
  const outG = new Uint8Array(n)
  const outB = new Uint8Array(n)
  const outA = new Uint8Array(n)

  for (const layer of frame.layers) {
    if (!layer.meta.visible) continue
    const lop = layer.meta.opacity  // 0-255
    const mode = layer.meta.blendMode

    for (let i = 0; i < n; i++) {
      const c = layer.cells[i]
      if (c === null) continue

      const sr = parseInt(c.slice(1, 3), 16)
      const sg = parseInt(c.slice(3, 5), 16)
      const sb = parseInt(c.slice(5, 7), 16)
      const rawSa = c.length === 9 ? parseInt(c.slice(7, 9), 16) : 255
      const sa = (rawSa * lop / 255) | 0

      if (sa === 0) continue

      const [br, bg, bb] = applyBlend(mode, sr, sg, sb, outR[i], outG[i], outB[i])

      const da = outA[i]
      const outAlpha = sa + ((da * (255 - sa) / 255) | 0)
      const dstWeight = (da * (255 - sa) / 255) | 0

      outR[i] = ((br * sa + outR[i] * dstWeight) / outAlpha) | 0
      outG[i] = ((bg * sa + outG[i] * dstWeight) / outAlpha) | 0
      outB[i] = ((bb * sa + outB[i] * dstWeight) / outAlpha) | 0
      outA[i] = outAlpha
    }
  }

  const cells: Cell[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const a = outA[i]
    if (a === 0) {
      cells[i] = null
    } else {
      const r = outR[i].toString(16).padStart(2, '0')
      const g = outG[i].toString(16).padStart(2, '0')
      const b = outB[i].toString(16).padStart(2, '0')
      cells[i] = a === 255 ? `#${r}${g}${b}` : `#${r}${g}${b}${a.toString(16).padStart(2, '0')}`
    }
  }

  return { width, height, cells }
}
