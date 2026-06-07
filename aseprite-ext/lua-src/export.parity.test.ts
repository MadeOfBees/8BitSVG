/**
 * Output / parity tests for the Aseprite extension.
 *
 * Transpiles export.ts → svg.generated.lua via tstl, runs that generated Lua in a
 * real Lua 5.4 VM (wasmoon), and asserts its SVG + React output is byte-identical
 * to calling the TypeScript source (src/lib/svg.ts) on the same sprites. This is
 * what guarantees the generated extension can't silently drift from the web app.
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LuaFactory } from 'wasmoon'
import { toReactComponent, toSvgString } from '../../src/lib/svg'
import type { Bounds, Grid } from '../../src/types'

const TSTL_CONFIG = 'aseprite-ext/lua-src/tstl.tsconfig.json'
const GENERATED = 'aseprite-ext/dist/_lua/8bitsvg.generated.lua'

let lua: Awaited<ReturnType<LuaFactory['createEngine']>>

beforeAll(async () => {
  // Generate the Lua from the TS source, exactly as the build does.
  execSync(`bunx tstl -p ${TSTL_CONFIG}`, { stdio: 'pipe' })
  const code = readFileSync(GENERATED, 'utf8')
  lua = await new LuaFactory().createEngine()
  // Load the bundle as a vararg IIFE (the tstl bundle references top-level '...')
  // so its module table lands in a global we can call.
  await lua.doString(`__svgmod = (function(...)\n${code}\nend)()`)
}, 60_000)

afterAll(() => {
  lua?.global.close()
})

const full = (g: Grid): Bounds => ({ x: 0, y: 0, width: g.width, height: g.height })

/** A Lua table literal of the grid's cells ("" = transparent). */
function luaCells(g: Grid): string {
  return '{' + g.cells.map((c) => `"${c ?? ''}"`).join(',') + '}'
}
// Run the generated Lua functions with literal args (no JS<->Lua proxy marshaling).
async function luaSvg(g: Grid): Promise<string> {
  return (await lua.doString(
    `return __svgmod.svgFromFlat(${g.width}, ${g.height}, ${luaCells(g)})`,
  )) as string
}
async function luaReact(g: Grid, name: string): Promise<string> {
  return (await lua.doString(
    `return __svgmod.reactFromFlat(${g.width}, ${g.height}, ${luaCells(g)}, "${name}")`,
  )) as string
}

const fixtures: Record<string, Grid> = {
  'solid 2x2': { width: 2, height: 2, cells: ['#ff0000', '#ff0000', '#ff0000', '#ff0000'] },
  'two separate same-color (grouped)': { width: 2, height: 2, cells: ['#ff0000', null, null, '#ff0000'] },
  'transparent holes': { width: 2, height: 2, cells: ['#ff0000', null, null, '#0000ff'] },
  'multi-color exact cover 3x3': {
    width: 3, height: 3,
    cells: ['#ff0000', '#ff0000', '#0000ff', '#ff0000', '#0000ff', '#0000ff', '#ff0000', '#ff0000', '#ff0000'],
  },
  'non-square 3x2': {
    width: 3, height: 2,
    cells: ['#112233', '#445566', null, null, '#778899', '#aabbcc'],
  },
  'semi-transparent pixel': {
    width: 1, height: 1, cells: ['#ff00007f'],
  },
  'all-transparent': {
    width: 2, height: 2, cells: [null, null, null, null],
  },
  'single-pixel opaque': {
    width: 1, height: 1, cells: ['#aabbcc'],
  },
}

describe('generated Lua matches the TypeScript source', () => {
  for (const [name, g] of Object.entries(fixtures)) {
    it(`SVG parity — ${name}`, async () => {
      expect(await luaSvg(g)).toBe(toSvgString(g, full(g)))
    })
    it(`React parity — ${name}`, async () => {
      expect(await luaReact(g, 'MyArt')).toBe(toReactComponent(g, full(g), 'MyArt'))
    })
  }

  it('React parity — invalid component name falls back to PixelArt', async () => {
    const g = fixtures['single-pixel opaque']
    expect(await luaReact(g, '123invalid')).toBe(toReactComponent(g, full(g), '123invalid'))
  })
})

describe('golden output (locks the exact format)', () => {
  it('emits the expected SVG for a transparent-hole sprite', async () => {
    const g = fixtures['transparent holes']
    const expected =
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 2 2" shape-rendering="crispEdges">\n' +
      '  <rect x="0" y="0" width="1" height="1" fill="#ff0000"/>\n' +
      '  <rect x="1" y="1" width="1" height="1" fill="#0000ff"/>\n' +
      '</svg>'
    expect(toSvgString(g, full(g))).toBe(expected)
    expect(await luaSvg(g)).toBe(expected)
  })

  it('emits fill-opacity="0.498" for a half-transparent pixel', async () => {
    const g = fixtures['semi-transparent pixel']
    const expected =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 1 1" shape-rendering="crispEdges">\n' +
      '  <rect x="0" y="0" width="1" height="1" fill="#ff0000" fill-opacity="0.498"/>\n' +
      '</svg>'
    expect(toSvgString(g, full(g))).toBe(expected)
    expect(await luaSvg(g)).toBe(expected)
  })
})
