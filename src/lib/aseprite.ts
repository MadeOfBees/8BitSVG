import type { Cell, FrameData, LayerEntry } from '../types'

const MAGIC_FILE = 0xa5e0
const MAGIC_FRAME = 0xf1fa
const CHUNK_LAYER = 0x2004
const CHUNK_CEL = 0x2005
const CHUNK_PALETTE = 0x2019
const CHUNK_TILESET = 0x2023
const DEPTH_RGBA = 32
const DEPTH_GRAY = 16
const DEPTH_INDEXED = 8

async function zlibDecompress(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      'Aseprite import needs a browser with DecompressionStream (Safari 16.4+, Chrome 80+, Firefox 113+).',
    )
  }
  const ds = new DecompressionStream('deflate')
  const writer = ds.writable.getWriter()
  writer.write(data.slice())
  writer.close()
  const chunks: Uint8Array[] = []
  const reader = ds.readable.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  return out
}

// ── Blend mode helpers ──────────────────────────────────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
          : max === gn ? ((bn - rn) / d + 2) / 6
          : ((rn - gn) / d + 4) / 6
  return [h, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v] }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [
    Math.round(hue2rgb(h + 1 / 3) * 255),
    Math.round(hue2rgb(h) * 255),
    Math.round(hue2rgb(h - 1 / 3) * 255),
  ]
}

/**
 * Apply an Aseprite blend mode to one source/destination pixel.
 * All values are 0-255 integers. Returns blended [R, G, B].
 */
export function applyBlend(
  mode: number,
  sR: number, sG: number, sB: number,
  dR: number, dG: number, dB: number,
): [number, number, number] {
  if (mode >= 12 && mode <= 15) {
    const [sh, ss, sl] = rgbToHsl(sR, sG, sB)
    const [dh, ds, dl] = rgbToHsl(dR, dG, dB)
    switch (mode) {
      case 12: return hslToRgb(sh, ds, dl)  // Hue
      case 13: return hslToRgb(dh, ss, dl)  // Saturation
      case 14: return hslToRgb(sh, ss, dl)  // Color
      case 15: return hslToRgb(dh, ds, sl)  // Luminosity
    }
  }
  const ch = (s: number, d: number): number => {
    switch (mode) {
      case 1:  return (s * d / 255) | 0                                                              // Multiply
      case 2:  return 255 - (((255 - s) * (255 - d) / 255) | 0)                                     // Screen
      case 3:  return d < 128                                                                         // Overlay
        ? (2 * s * d / 255) | 0
        : 255 - ((2 * (255 - s) * (255 - d) / 255) | 0)
      case 4:  return Math.min(s, d)                                                                  // Darken
      case 5:  return Math.max(s, d)                                                                  // Lighten
      case 6:  return s === 255 ? 255 : Math.min(255, (d * 255 / (255 - s)) | 0)                    // Color Dodge
      case 7:  return s === 0   ? 0   : Math.max(0,   255 - (((255 - d) * 255 / s) | 0))            // Color Burn
      case 8:  return s < 128                                                                         // Hard Light
        ? (2 * s * d / 255) | 0
        : 255 - ((2 * (255 - s) * (255 - d) / 255) | 0)
      case 9:  return Math.max(0, Math.min(255, (d * ((255 - 2 * s) * d / 255 + 2 * s) / 255) | 0)) // Soft Light
      case 10: return Math.abs(s - d)                                                                 // Difference
      case 11: return (s + d - 2 * s * d / 255) | 0                                                  // Exclusion
      case 16: return Math.min(255, s + d)                                                            // Addition
      case 17: return Math.max(0, d - s)                                                              // Subtract
      case 18: return s === 0   ? 255 : Math.min(255, (d * 255 / s) | 0)                            // Divide
      default: return s                                                                               // Normal
    }
  }
  return [ch(sR, dR), ch(sG, dG), ch(sB, dB)]
}

// ── Tileset storage ─────────────────────────────────────────────────────────

interface TilesetInfo {
  tiles: Uint8Array[]
  tileW: number
  tileH: number
}

// ── Layer descriptor ─────────────────────────────────────────────────────────

interface LayerInfo {
  name: string
  visible: boolean
  opacity: number
  type: number        // 0=normal, 1=group, 2=tilemap
  childLevel: number
  blendMode: number
  tilesetIndex?: number
}

/**
 * Parse an Aseprite (.ase/.aseprite) file and return one FrameData per frame.
 * Each layer is preserved as a separate LayerEntry; compositing happens in the
 * editor via compositeFrame(). Throws on invalid magic or oversized canvas.
 */
export async function parseAseFile(buffer: ArrayBuffer): Promise<FrameData[]> {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  if (view.getUint16(4, true) !== MAGIC_FILE) throw new Error('Not an ASE file.')

  const numFrames = view.getUint16(6, true)
  const width = view.getUint16(8, true)
  const height = view.getUint16(10, true)
  const colorDepth = view.getUint16(12, true)
  const paletteTransparentIndex = view.getUint8(28)

  if (numFrames === 0) throw new Error('File contains no frames.')
  if (width > 256 || height > 256) {
    throw new Error(`Canvas too large (${width}x${height}); max is 256x256.`)
  }

  const palette = new Uint8Array(256 * 4)
  for (let i = 0; i < 256; i++) {
    palette[i * 4] = i; palette[i * 4 + 1] = i
    palette[i * 4 + 2] = i; palette[i * 4 + 3] = 255
  }

  const layers: LayerInfo[] = []
  const tilesets = new Map<number, TilesetInfo>()

  // [frameIndex][layerIndex] = RGBA canvas-size buffer, or null
  const allFrameCels: (Uint8Array | null)[][] = []

  let offset = 128

  for (let f = 0; f < numFrames; f++) {
    const frameStart = offset
    if (view.getUint16(frameStart + 4, true) !== MAGIC_FRAME) throw new Error('Bad frame magic.')

    let numChunks = view.getUint16(frameStart + 6, true)
    const newNum = view.getUint32(frameStart + 12, true)
    if (newNum !== 0) numChunks = newNum

    offset = frameStart + 16

    const frameCels: (Uint8Array | null)[] = []
    allFrameCels.push(frameCels)

    for (let c = 0; c < numChunks; c++) {
      const chunkStart = offset
      const chunkSize = view.getUint32(chunkStart, true)
      const chunkType = view.getUint16(chunkStart + 4, true)
      const data = chunkStart + 6

      if (chunkType === CHUNK_LAYER) {
        const flags = view.getUint16(data, true)
        const layerType = view.getUint16(data + 2, true)
        const childLevel = view.getUint16(data + 4, true)
        const blendMode = view.getUint16(data + 10, true)
        const opacity = view.getUint8(data + 12)
        const nameLen = view.getUint16(data + 16, true)
        const name = Array.from({ length: nameLen }, (_, i) =>
          String.fromCharCode(view.getUint8(data + 18 + i))
        ).join('')
        let tilesetIndex: number | undefined
        if (layerType === 2) {
          tilesetIndex = view.getUint32(data + 18 + nameLen, true)
        }
        layers.push({
          name: name || `Layer ${layers.length + 1}`,
          visible: (flags & 0x1) !== 0,
          opacity,
          type: layerType,
          childLevel,
          blendMode,
          tilesetIndex,
        })

      } else if (chunkType === CHUNK_CEL) {
        const layerIndex = view.getUint16(data, true)
        const xpos = view.getInt16(data + 2, true)
        const ypos = view.getInt16(data + 4, true)
        const celOpacity = view.getUint8(data + 6)
        const celType = view.getUint16(data + 7, true)
        const celData = data + 16

        // A cel chunk may reference a layer index higher than any we've seen so far; fill the
        // sparse gaps so every entry aligns with its layer index for the conversion pass below.
        while (frameCels.length <= layerIndex) frameCels.push(null)

        if (celType === 1) {
          // Linked cel: pixel data is shared from an earlier frame (common for static background layers).
          const srcFrame = view.getUint16(celData, true)
          if (srcFrame < f) frameCels[layerIndex] = allFrameCels[srcFrame]?.[layerIndex] ?? null

        } else if (celType === 0 || celType === 2) {
          const celW = view.getUint16(celData, true)
          const celH = view.getUint16(celData + 2, true)
          if (celW > 256 || celH > 256) {
            throw new Error(`Cel too large (${celW}x${celH}); max is 256x256.`)
          }
          const pixStart = celData + 4

          let pixelBytes: Uint8Array
          if (celType === 2) {
            pixelBytes = await zlibDecompress(bytes.slice(pixStart, chunkStart + chunkSize))
          } else {
            pixelBytes = bytes.slice(pixStart, chunkStart + chunkSize)
          }

          const rgba = new Uint8Array(width * height * 4)
          const bpp = colorDepth / 8
          const effectiveOpacity = celOpacity / 255

          for (let py = 0; py < celH; py++) {
            for (let px = 0; px < celW; px++) {
              const cx = xpos + px
              const cy = ypos + py
              if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue
              const src = (py * celW + px) * bpp
              const dst = (cy * width + cx) * 4

              if (colorDepth === DEPTH_RGBA) {
                rgba[dst] = pixelBytes[src]
                rgba[dst + 1] = pixelBytes[src + 1]
                rgba[dst + 2] = pixelBytes[src + 2]
                rgba[dst + 3] = Math.round(pixelBytes[src + 3] * effectiveOpacity)
              } else if (colorDepth === DEPTH_GRAY) {
                const v = pixelBytes[src]
                rgba[dst] = v; rgba[dst + 1] = v; rgba[dst + 2] = v
                rgba[dst + 3] = Math.round(pixelBytes[src + 1] * effectiveOpacity)
              } else if (colorDepth === DEPTH_INDEXED) {
                const idx = pixelBytes[src]
                if (idx !== paletteTransparentIndex) {
                  rgba[dst] = palette[idx * 4]
                  rgba[dst + 1] = palette[idx * 4 + 1]
                  rgba[dst + 2] = palette[idx * 4 + 2]
                  rgba[dst + 3] = Math.round(palette[idx * 4 + 3] * effectiveOpacity)
                }
              }
            }
          }
          frameCels[layerIndex] = rgba

        } else if (celType === 3) {
          const tileMapBytes = await zlibDecompress(bytes.slice(celData, chunkStart + chunkSize))
          const tmView = new DataView(tileMapBytes.buffer, tileMapBytes.byteOffset)
          const tmW = tmView.getUint16(0, true)
          const tmH = tmView.getUint16(2, true)
          const bitsPerTile = tmView.getUint16(4, true)
          const tileIdMask = tmView.getUint32(6, true)
          const xFlipMask = tmView.getUint32(10, true)
          const yFlipMask = tmView.getUint32(14, true)
          const bytesPerTile = bitsPerTile >> 3
          const tileDataStart = 32

          const layer = layers[layerIndex]
          const tsId = layer?.tilesetIndex
          const tsInfo = tsId !== undefined ? tilesets.get(tsId) : undefined

          const rgba = new Uint8Array(width * height * 4)

          if (tsInfo) {
            for (let ty = 0; ty < tmH; ty++) {
              for (let tx = 0; tx < tmW; tx++) {
                const entryOff = tileDataStart + (ty * tmW + tx) * bytesPerTile
                const entry = bytesPerTile === 4
                  ? tmView.getUint32(entryOff, true)
                  : bytesPerTile === 2
                    ? tmView.getUint16(entryOff, true)
                    : tmView.getUint8(entryOff)
                const tileId = entry & tileIdMask
                const xFlip = xFlipMask !== 0 && (entry & xFlipMask) !== 0
                const yFlip = yFlipMask !== 0 && (entry & yFlipMask) !== 0
                const tilePixels = tsInfo.tiles[tileId]
                if (!tilePixels) continue

                for (let py = 0; py < tsInfo.tileH; py++) {
                  for (let px = 0; px < tsInfo.tileW; px++) {
                    const cx = xpos + tx * tsInfo.tileW + px
                    const cy = ypos + ty * tsInfo.tileH + py
                    if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue
                    const srcPx = xFlip ? tsInfo.tileW - 1 - px : px
                    const srcPy = yFlip ? tsInfo.tileH - 1 - py : py
                    const src = (srcPy * tsInfo.tileW + srcPx) * 4
                    const dst = (cy * width + cx) * 4
                    rgba[dst] = tilePixels[src]
                    rgba[dst + 1] = tilePixels[src + 1]
                    rgba[dst + 2] = tilePixels[src + 2]
                    rgba[dst + 3] = Math.round(tilePixels[src + 3] * (celOpacity / 255))
                  }
                }
              }
            }
          }
          frameCels[layerIndex] = rgba
        }

      } else if (chunkType === CHUNK_PALETTE) {
        const firstIdx = view.getUint32(data + 4, true)
        const lastIdx = view.getUint32(data + 8, true)
        let p = data + 20
        for (let i = firstIdx; i <= lastIdx && i < 256; i++) {
          const flags = view.getUint16(p, true)
          palette[i * 4] = view.getUint8(p + 2)
          palette[i * 4 + 1] = view.getUint8(p + 3)
          palette[i * 4 + 2] = view.getUint8(p + 4)
          palette[i * 4 + 3] = view.getUint8(p + 5)
          p += 6
          if (flags & 1) { p += 2 + view.getUint16(p, true) }
        }

      } else if (chunkType === CHUNK_TILESET) {
        const tsId = view.getUint32(data, true)
        const tsFlags = view.getUint32(data + 4, true)
        const numTiles = view.getUint32(data + 8, true)
        const tileW = view.getUint16(data + 12, true)
        const tileH = view.getUint16(data + 14, true)
        if (tsFlags & 0x2) {
          const nameLen = view.getUint16(data + 32, true)
          const pixelDataStart = data + 34 + nameLen
          const tilePixels = await zlibDecompress(bytes.slice(pixelDataStart, chunkStart + chunkSize))
          const tileSize = tileW * tileH * 4
          const tiles: Uint8Array[] = []
          for (let t = 0; t < numTiles; t++) {
            tiles.push(tilePixels.slice(t * tileSize, (t + 1) * tileSize))
          }
          tilesets.set(tsId, { tiles, tileW, tileH })
        }
      }

      offset = chunkStart + chunkSize
    }
  }

  // Propagate group layer visibility to children.
  const visibleAtLevel: boolean[] = [true]
  for (const layer of layers) {
    const parentVisible = visibleAtLevel[layer.childLevel - 1] ?? true
    layer.visible = layer.visible && parentVisible
    visibleAtLevel[layer.childLevel] = layer.visible
  }

  // Convert to FrameData[]: one LayerEntry per non-group layer per frame.
  return allFrameCels.map((frameCels) => {
    const layerEntries: LayerEntry[] = []

    for (let li = 0; li < layers.length; li++) {
      if (layers[li].type === 1) continue  // skip group layers

      const info = layers[li]
      const celRgba = frameCels[li] ?? null
      const cells: Cell[] = new Array(width * height).fill(null)

      if (celRgba) {
        for (let p = 0; p < width * height; p++) {
          const a = celRgba[p * 4 + 3]
          if (a === 0) continue
          const r = celRgba[p * 4]
          const g = celRgba[p * 4 + 1]
          const b = celRgba[p * 4 + 2]
          const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
          cells[p] = a === 255 ? hex : hex + a.toString(16).padStart(2, '0')
        }
      }

      layerEntries.push({
        meta: {
          id: `ase-layer-${li}`,
          name: info.name,
          visible: info.visible,
          opacity: info.opacity,
          blendMode: info.blendMode,
        },
        cells,
      })
    }

    if (layerEntries.length === 0) {
      layerEntries.push({
        meta: { id: 'ase-layer-0', name: 'Layer 1', visible: true, opacity: 255, blendMode: 0 },
        cells: new Array(width * height).fill(null),
      })
    }

    return { width, height, layers: layerEntries }
  })
}
