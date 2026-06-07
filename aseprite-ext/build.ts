/**
 * Build script for the 8BitSVG Aseprite extension.
 * Run with: bun run build:ext
 *
 * 1. Transpiles src/lib/svg.ts -> aseprite-ext/dist/_lua/8bitsvg.generated.lua via
 *    TypeScriptToLua (the extension shares the exact web-app algorithm — DRY).
 * 2. Packages lua/ (main.lua, manifest, schema) + the generated module into
 *    aseprite-ext/dist/8bitsvg.aseprite-extension (a renamed zip).
 *
 * Pure Lua — no compiled binary, so the artifact is a few KB and works on every OS.
 */
import { $ } from 'bun'
import { existsSync, mkdirSync, copyFileSync, readdirSync, renameSync, rmSync } from 'fs'
import { join } from 'path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const extDir = join(root, 'aseprite-ext')
const distDir = join(extDir, 'dist')
const luaDir = join(extDir, 'lua')
const tstlConfig = join(extDir, 'lua-src', 'tstl.tsconfig.json')
const generatedLua = join(distDir, '_lua', '8bitsvg.generated.lua')
const extensionOut = join(distDir, '8bitsvg.aseprite-extension')

if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true })

// Step 1: transpile svg.ts -> Lua (single source of truth shared with the web app).
console.log('Transpiling src/lib/svg.ts → Lua (typescript-to-lua)…')
await $`bunx tstl -p ${tstlConfig}`
if (!existsSync(generatedLua)) throw new Error('tstl did not produce 8bitsvg.generated.lua')
console.log(`  → ${generatedLua}`)

// Step 2: stage the Lua sources + generated module, then zip.
const stageDir = join(distDir, '_stage')
rmSync(stageDir, { recursive: true, force: true })
mkdirSync(stageDir, { recursive: true })
for (const f of readdirSync(luaDir)) {
  copyFileSync(join(luaDir, f), join(stageDir, f))
}
copyFileSync(generatedLua, join(stageDir, '8bitsvg.generated.lua'))

console.log('Packaging extension…')
rmSync(extensionOut, { force: true })
// Enumerate staged files explicitly so paths are safely quoted by Bun's shell,
// avoiding glob expansion failures when stageDir contains spaces or special chars.
const stagedFiles = readdirSync(stageDir).map((f) => join(stageDir, f))
if (process.platform === 'win32') {
  // PowerShell 7 enforces a .zip extension on Compress-Archive output, so we
  // write to a temp .zip then rename to .aseprite-extension (it's just a zip).
  const tmpZip = extensionOut.replace(/\.aseprite-extension$/, '.zip')
  rmSync(tmpZip, { force: true })
  await $`powershell Compress-Archive -LiteralPath ${stagedFiles[0]} -DestinationPath ${tmpZip}`
  for (const f of stagedFiles.slice(1)) {
    await $`powershell Compress-Archive -Update -LiteralPath ${f} -DestinationPath ${tmpZip}`
  }
  renameSync(tmpZip, extensionOut)
} else {
  await $`zip -j ${extensionOut} ${stagedFiles}`
}

// Clean up the staging folder so it doesn't linger in dist/.
rmSync(stageDir, { recursive: true, force: true })

console.log(`  → ${extensionOut}`)
console.log('Done. Install by double-clicking 8bitsvg.aseprite-extension in Aseprite.')
