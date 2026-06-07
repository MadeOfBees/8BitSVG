/**
 * TypeScriptToLua entry point for the 8BitSVG Aseprite extension.
 *
 * This file is transpiled to `svg.generated.lua` at build time and `require`d by
 * main.lua. It imports the *exact* greedy-mesh / SVG / React code the web app
 * uses (src/lib/svg.ts) — edit svg.ts, rebuild, and both stay in sync (DRY).
 *
 * Boundary note: Lua tables can't represent `nil` holes, so the public functions
 * take a flat string[] where "" means transparent, and map "" -> null before
 * calling into svg.ts.
 */
import { toSvgString, toReactComponent } from '../../src/lib/svg'
import type { Grid } from '../../src/types'

function gridFromFlat(width: number, height: number, flat: string[]): Grid {
  const cells = flat.map((c) => (c === '' ? null : c))
  return { width, height, cells }
}

/** Optimized SVG string from a flat cell array ("" = transparent). */
export function svgFromFlat(width: number, height: number, flat: string[]): string {
  return toSvgString(gridFromFlat(width, height, flat), { x: 0, y: 0, width, height })
}

/** React component (.tsx) string from a flat cell array ("" = transparent). */
export function reactFromFlat(
  width: number,
  height: number,
  flat: string[],
  name: string,
): string {
  return toReactComponent(gridFromFlat(width, height, flat), { x: 0, y: 0, width, height }, name)
}
