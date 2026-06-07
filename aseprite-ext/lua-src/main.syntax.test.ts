/**
 * Syntax check for the hand-written Aseprite wrapper (main.lua).
 *
 * Aseprite itself can't be launched here, but we can at least guarantee main.lua
 * *compiles* as valid Lua 5.4: we `load()` it in wasmoon (compile-only — it is
 * never executed, so the Aseprite globals it references like `app`, `Dialog`, and
 * `plugin` don't need to exist). This catches syntax slips that would otherwise
 * only surface when a user installs the extension.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LuaFactory } from 'wasmoon'

const MAIN_LUA = 'aseprite-ext/lua/main.lua'

let lua: Awaited<ReturnType<LuaFactory['createEngine']>>

beforeAll(async () => {
  lua = await new LuaFactory().createEngine()
})
afterAll(() => {
  lua?.global.close()
})

describe('main.lua', () => {
  it('compiles as valid Lua 5.4', async () => {
    const code = readFileSync(MAIN_LUA, 'utf8')
    // Embed as a long-bracket literal so the source crosses into Lua untouched,
    // then load() it (compile only). Returns "" on success or the error message.
    const err = (await lua.doString(
      `local fn, e = load([==[\n${code}]==], "@main.lua")\nreturn fn and "" or tostring(e)`,
    )) as string
    expect(err).toBe('')
  })

  it('registers a File ▸ Scripts command via the plugin API', () => {
    const code = readFileSync(MAIN_LUA, 'utf8')
    expect(code).toContain('function init(plugin)')
    expect(code).toContain('plugin:newCommand')
    expect(code).toContain('group = "file_scripts"')
    // No legacy command-execution path.
    expect(code).not.toContain('os.execute')
    // Wired to the correct exported function names from the generated module.
    expect(code).toContain('svgFromFlat')
    expect(code).toContain('reactFromFlat')
    // Alpha threshold and 8-digit hex format for semi-transparent pixels.
    expect(code).toContain('rgbaA')
    expect(code).toContain('%02x%02x%02x%02x')
  })
})
