import type { FrameData } from '../types'

const CHUNK_LAYER = 0x2004
const CHUNK_CEL = 0x2005

/**
 * Serialize a timeline of FrameData into a valid Aseprite (.ase) binary.
 * Produces one CHUNK_LAYER per layer (written in frame 0), then one CHUNK_CEL
 * per non-empty layer per frame. Cel type 0 (raw, uncompressed).
 */
export function toAseBuffer(frames: FrameData[]): Uint8Array<ArrayBuffer> {
  if (frames.length === 0) throw new Error('No frames to export.')
  const { width, height } = frames[0]
  if (frames.some((f) => f.width !== width || f.height !== height))
    throw new Error('All frames must share the same dimensions.')

  const numFrames = frames.length
  const nLayers = frames[0].layers.length

  // Pre-scan: which layers have content in each frame (skip fully-null cels).
  const activeLayerMask: boolean[][] = frames.map((f) =>
    f.layers.map((l) => l.cells.some((c) => c !== null))
  )

  // Buffer size: file header + frame headers + layer chunks (frame 0) + cel chunks
  const layerChunkTotal = frames[0].layers.reduce((s, l) => s + 24 + l.meta.name.length, 0)
  const celChunkSize = 6 + 16 + 4 + width * height * 4
  const maxCels = numFrames * nLayers
  const totalSize = 128 + numFrames * 16 + layerChunkTotal + maxCels * celChunkSize

  const buf = new ArrayBuffer(totalSize)
  const view = new DataView(buf)
  let off = 0

  const u8 = (v: number) => { view.setUint8(off, v); off++ }
  const u16 = (v: number) => { view.setUint16(off, v, true); off += 2 }
  const s16 = (v: number) => { view.setInt16(off, v, true); off += 2 }
  const u32 = (v: number) => { view.setUint32(off, v, true); off += 4 }
  const zeros = (n: number) => { off += n }
  const str = (s: string) => { u16(s.length); for (let i = 0; i < s.length; i++) u8(s.charCodeAt(i)) }

  // ── File header (128 bytes) ──────────────────────────────────────────────
  const fileSizeOff = off
  u32(0)                // file size (filled below)
  u16(0xa5e0)           // magic
  u16(numFrames)
  u16(width)
  u16(height)
  u16(32)               // color depth: RGBA
  u32(0x00000001)       // flags: layer opacity valid
  u16(100)              // speed (deprecated)
  u32(0); u32(0)        // reserved
  u8(0)                 // transparent palette entry
  zeros(3)
  u16(0)                // num colors
  u8(1); u8(1)          // pixel ratio 1:1
  s16(0); s16(0)        // grid origin
  u16(16); u16(16)      // grid size
  zeros(84)             // reserved

  // ── Frames ───────────────────────────────────────────────────────────────
  for (let f = 0; f < numFrames; f++) {
    const frameOff = off
    const frameBytesOff = off

    const activeCels = activeLayerMask[f].filter(Boolean).length
    const chunkCount = (f === 0 ? nLayers : 0) + activeCels

    u32(0)              // frame byte count (filled below)
    u16(0xf1fa)         // magic
    u16(0)              // old chunk count (0 = use new field)
    u16(100)            // frame duration: 100 ms
    zeros(2)
    u32(chunkCount)

    // Layer chunks (frame 0 only)
    if (f === 0) {
      for (let li = 0; li < nLayers; li++) {
        const meta = frames[0].layers[li].meta
        const chunkOff = off
        u32(0)              // chunk size (filled below)
        u16(CHUNK_LAYER)
        u16(meta.visible ? 0x0001 : 0x0000)  // flags
        u16(0)              // layer type: normal
        u16(0)              // child level
        u16(0); u16(0)      // default width/height (ignored)
        u16(meta.blendMode)
        u8(meta.opacity)
        zeros(3)
        str(meta.name)
        view.setUint32(chunkOff, off - chunkOff, true)
      }
    }

    // Cel chunks (one per non-empty layer)
    for (let li = 0; li < nLayers; li++) {
      if (!activeLayerMask[f][li]) continue

      const layer = frames[f].layers[li]
      const chunkOff = off
      u32(0)              // chunk size (filled below)
      u16(CHUNK_CEL)
      u16(li)             // layer index
      s16(0); s16(0)      // x, y position
      u8(255)             // cel opacity
      u16(0)              // cel type: 0 = raw
      s16(0)              // z-index
      zeros(5)
      u16(width)
      u16(height)

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const cell = layer.cells[y * width + x]
          if (cell) {
            u8(parseInt(cell.slice(1, 3), 16))  // R
            u8(parseInt(cell.slice(3, 5), 16))  // G
            u8(parseInt(cell.slice(5, 7), 16))  // B
            u8(cell.length === 9 ? parseInt(cell.slice(7, 9), 16) : 255)  // A
          } else {
            zeros(4)
          }
        }
      }

      view.setUint32(chunkOff, off - chunkOff, true)
    }

    view.setUint32(frameBytesOff, off - frameOff, true)
  }

  view.setUint32(fileSizeOff, off, true)
  return new Uint8Array(buf.slice(0, off))
}
