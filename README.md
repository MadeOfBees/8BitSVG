<div align="center">

# 8BitSVG

[![CI](https://badgen.net/github/checks/MadeOfBees/8BitSVG/main)](https://github.com/MadeOfBees/8BitSVG/actions/workflows/ci.yml)
[![Live demo](https://badgen.net/badge/demo/live/green)](https://madeofbees.github.io/8BitSVG/)
[![PWA](https://badgen.net/badge/PWA/installable/purple)](https://madeofbees.github.io/8BitSVG/)
[![TypeScript](https://badgen.net/badge/TypeScript/6/blue)](https://www.typescriptlang.org/)
[![React](https://badgen.net/badge/React/19/cyan)](https://react.dev/)
[![Vite](https://badgen.net/badge/Vite/8/purple)](https://vitejs.dev/)
[![Bun](https://badgen.net/badge/Bun/1/yellow)](https://bun.sh/)
[![GitHub Stars](https://badgen.net/github/stars/MadeOfBees/8BitSVG)](https://github.com/MadeOfBees/8BitSVG/stargazers)
[![License](https://badgen.net/github/license/MadeOfBees/8BitSVG)](LICENSE)
[![Aseprite](https://badgen.net/badge/Aseprite/extension/pink)](aseprite-ext/)

**Draw pixel art in the browser, animate across frames, and export a clean transparent SVG, a pasteable React component, a PNG, or a round-trip Aseprite file — 100% in your browser.**

[**▶ Open the live demo**](https://madeofbees.github.io/8BitSVG/)

</div>

Paint on a grid with as many colors as you like, build up a multi-frame timeline for
animated sprites, drag a crop box around the part you want, and export a tidy
transparent-background SVG whose rectangles are merged down to the fewest shapes — or a
one-click React component, a 1 px-per-cell PNG, or a full-timeline Aseprite file you can
open straight in Aseprite and keep editing. Import `.ase`/`.aseprite` files back in to
close the round-trip.

It runs entirely in the browser. No backend, no accounts; your current drawing is
autosaved to `localStorage` so a refresh never loses work. A service worker pre-caches
all assets so the app loads fully offline after the first visit.

---

## Contents

- [8BitSVG](#8bitsvg)
  - [Contents](#contents)
  - [Features](#features)
  - [How it works](#how-it-works)
  - [Keyboard shortcuts](#keyboard-shortcuts)
  - [Tech stack](#tech-stack)
  - [Requirements](#requirements)
  - [Getting started](#getting-started)
  - [Commands](#commands)
  - [Project structure](#project-structure)
  - [Testing](#testing)
  - [Deployment (GitHub Pages)](#deployment-github-pages)
  - [Aseprite Extension](#aseprite-extension)
  - [Contributing](#contributing)
  - [License](#license)

## Features

- ✏️ **Five tools** — pencil, eraser, flood-fill bucket, eyedropper, and a move tool
  that slides the whole grid around the workspace.
- 🎨 **Unlimited colors** — full color picker with a validated hex field, a
  foreground/background color pair (swap with `X`, reset to black/white with `D`),
  per-color alpha (0–255 slider + 8-digit `#rrggbbaa` hex), and a row of saved
  swatches; right-click a swatch to remove it.
- 🗂️ **Layers** — each frame holds a stack of independent layers. Add, delete,
  reorder, duplicate, merge down, or flatten. Toggle visibility per layer; set
  per-layer opacity. Layers composite bottom-to-top with Porter-Duff alpha-over
  before export. The Layer Panel shows live thumbnails and an opacity slider for
  the active layer.
- ✂️ **Drag-to-crop on export** — draw a crop box over a live preview; "Fit to content"
  snaps it to the painted bounds.
- 🧩 **Optimized SVG** — adjacent same-color cells are greedy-meshed into the fewest
  `<rect>`s; colors with multiple rects are wrapped in `<g fill="…">` so each hex
  appears exactly once in the output. **Transparent by construction** — no background
  rect is ever emitted.
- ⚛️ **React export** — the same art wrapped as a typed, prop-spreading `.tsx` component.
- 🎞️ **Multi-frame timeline** — add, duplicate, and delete frames; click thumbnails at
  the bottom to switch; each frame is a fully independent canvas for animated sprites.
- 🪲 **Aseprite round-trip** — import `.ase`/`.aseprite` files (all frames, visible
  layers flattened) via File → Import Aseprite…; export back via Export → Aseprite tab
  as a valid `.aseprite` file with every frame intact.
- 🖼️ **PNG round-trip** — export the cropped region as a 1 px-per-cell transparent PNG;
  re-import it later via File → Import PNG to restore the drawing and keep working.
- 💾 **Copy or download** — grab the SVG/component to the clipboard, or download a
  `.svg` / `.tsx` / `.png` / `.aseprite` file.
- ↩️ **Undo / redo** — per-stroke history (up to 100 steps).
- 🔍 **Zoom** — buttons, keyboard, or scroll-wheel anywhere over the workspace.
- 📶 **Offline / installable** — a service worker pre-caches all assets; the app loads
  fully offline after the first visit. PWA install prompt available in Chrome, Edge, and
  Safari.
- 🕹️ **Sharp & retro** — a pixel font ([Monocraft](https://github.com/IdreesInc/Monocraft)),
  monochrome line icons, hard corners, and crisp-edge rendering throughout.

## How it works

```text
File → Import Aseprite…           File → Import PNG
  (all frames → timeline)           (single frame)
          │                                │
          └──────────────┬─────────────────┘
                         ▼
              draw / edit frames in the timeline
                         │  each cell → hex color or null (flat array)
                         ▼
              crop to a region (drag a box, or fit-to-content)
                         │
                         ▼
              greedy-mesh the painted cells into the fewest <rect>s
                         │  then group by color → each hex once via <g fill="…">
                         ▼
SVG string  ──or──▶  React component  ──or──▶  PNG (1px/cell)  ──or──▶  .aseprite (all frames)
                                                  │                              │
                                                  ▼                              ▼
                                         File → Import PNG              open in Aseprite,
                                           (round-trip)                 keep editing
```

A few deliberate choices worth calling out:

- **The SVG is the product, and it's optimized.** Rather than emitting one `<rect>` per
  pixel, [`greedyMesh`](src/lib/svg.ts) expands each unvisited painted cell as far right
  as the color holds, then as far down as the full span matches, and marks the block
  visited — the classic greedy-meshing approach. The result covers every painted cell
  exactly once with no overlap (an invariant the tests assert) using far fewer shapes.

- **Colors appear exactly once.** After meshing, rects are grouped by color. Colors with
  two or more rects are wrapped in `<g fill="…">` so the hex code is written once as an
  attribute on the group, and the child `<rect>` elements carry no `fill` of their own.
  Colors with a single rect keep inline `fill` — a wrapper would add bytes rather than
  save them.

- **Transparent by construction.** No background rectangle is ever written, and the
  `viewBox` is the crop size, so the exported SVG is transparent wherever you didn't
  paint. The editor's checkerboard is purely a visual cue — it never makes it into the
  output.

- **PNG is a first-class save format.** The offscreen canvas for PNG export draws each
  cell at 1 px, matching the grid model 1:1, with a transparent background. Combined
  with File → Import PNG (which reads the pixel colors back into the grid), this gives
  a lossless round-trip: draw → export PNG → reimport → keep drawing, with no color
  drift or metadata to manage.

- **Crisp pixels, everywhere.** The canvas renders with `imageSmoothingEnabled = false`
  and `image-rendering: pixelated`; the SVG carries `shape-rendering="crispEdges"`; and
  the UI uses Monocraft with `-webkit-font-smoothing: none`. Nothing gets blurred.

- **Drag gestures run on `window` listeners, not pointer capture.** The move and
  drag-to-crop gestures update React state on every pointer move, which re-renders the
  component mid-drag. Relying on `setPointerCapture` + React's `onPointerMove` through
  that churn proved flaky under a real mouse, so both gestures attach `pointermove` /
  `pointerup` listeners to `window` on pointer-down and tear them down on release — they
  keep tracking no matter where the cursor goes.

- **History is stroke-boundary snapshots.** A snapshot of the grid is pushed when a
  stroke *begins* (pointer-down), so one pencil drag or fill is a single undo step — see
  the reducer in [`src/state/useEditor.tsx`](src/state/useEditor.tsx). Moving the grid
  around the mat is *view* state and deliberately doesn't touch history.

- **Autosave is best-effort.** The persistable slice (grid + swatches + active color) is
  written to `localStorage` on a 400 ms debounce; a malformed or mismatched payload on
  load is quietly discarded in favor of a fresh canvas
  ([`src/lib/storage.ts`](src/lib/storage.ts)).

## Keyboard shortcuts

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| `B` / `P` | Pencil | `⌘/Ctrl + Z` | Undo |
| `E` | Eraser | `⌘/Ctrl + ⇧ + Z` · `Ctrl + Y` | Redo |
| `G` | Fill bucket | `⌘/Ctrl + A` | Select whole canvas |
| `I` | Eyedropper | `⌘/Ctrl + C` | Copy selection |
| `S` / `M` | Select | `⌘/Ctrl + X` | Cut selection |
| `V` / `H` | Move grid | `⌘/Ctrl + V` | Paste |
| `Esc` · `⌘/Ctrl + D` | Clear selection | `+` / `=` | Zoom in |
| `Delete` / `Backspace` | Delete selection | `-` | Zoom out |
| `X` | Swap FG/BG colors | scroll wheel | Zoom (over the workspace) |
| `D` | Reset FG/BG to black/white | Arrow keys | Move grid (one cell per press) |

Shortcuts are ignored while you're typing in an input or textarea.

## Tech stack

- [Bun](https://bun.sh/) — package manager, test runner, and script runner
- [Vite 8](https://vitejs.dev/) + [React 19](https://react.dev/) + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com/) (CSS-first, via `@tailwindcss/vite`)
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) for service worker + offline caching
- [Vitest](https://vitest.dev/) for unit tests

## Requirements

- **To use it:** any modern browser. Drawing uses a 2D `<canvas>`; clipboard export uses
  the async Clipboard API.
- **To develop it:** **[Bun](https://bun.sh/)** (installs dependencies and runs scripts). Node 20.19+ also works if you prefer npm/pnpm.

## Getting started

```bash
bun install
bun run dev      # start the dev server at http://localhost:5173
```

## Commands

```bash
bun run dev          # dev server with HMR → http://localhost:5173
bun run build        # type-check (tsc -b) + production build to dist/
bun run preview      # serve the production build locally
bun run lint         # ESLint

bun test             # unit tests (Vitest)
bun run test:watch   # Vitest in watch mode

bun run build:ext    # transpile svg.ts → Lua + package the Aseprite extension → aseprite-ext/dist/
```

## Project structure

```text
src/
  App.tsx                top-level layout: header, toolbar, canvas, layer panel, timeline, color panel, modal
  types.ts               Grid / Cell / FrameData / LayerEntry / LayerMeta / Tool / Bounds / Project types
  state/
    useEditor.tsx        useReducer editor store (frames[], activeFrame, activeLayer, tool, color, zoom)
                         + per-stroke history tracking activeLayer; debounced localStorage autosave
  lib/
    grid.ts              create / clone / index helpers, floodFill, contentBounds
    svg.ts               greedyMesh → groupByColor → SVG string / React component
    compose.ts           compositeFrame: bottom-to-top Porter-Duff alpha-over with per-layer opacity
    storage.ts           debounced load/save; validates layer structure; migrates old flat-grid format
    aseprite.ts          browser-native .ase/.aseprite parser (DataView + DecompressionStream)
    ase-writer.ts        serialize frames[] → valid .aseprite binary (RGBA, all frames and layers)
  components/
    Canvas.tsx           the drawing canvas: checkerboard, pointer drawing, move-grid, zoom
    FrameTimeline.tsx    thumbnail strip (composited) + add / duplicate / delete frame controls
    LayerPanel.tsx       layer stack panel: thumbnails, eye-toggle, opacity, rename, reorder
    TopBar.tsx           File menu (Import PNG, Import Aseprite…), Edit menu (+ layer ops), Export button
    ColorPanel.tsx       FG/BG color pair + alpha slider + hex field + swatches + palette import/export
    ExportModal.tsx      drag-to-crop preview + SVG / React / PNG / Aseprite tabs
    KeyboardShortcuts.tsx  global keydown handler (renders nothing)
  index.css              Tailwind v4 entry + Monocraft @font-face + crisp-pixel resets

aseprite-ext/
  lua-src/
    export.ts            tstl entry: re-exports svg.ts's algorithm for Lua
    tstl.tsconfig.json   TypeScriptToLua config (luaTarget 5.4, single bundle)
    export.parity.test.ts runs the generated Lua (wasmoon) and asserts it matches svg.ts
  build.ts               Bun build script: transpiles svg.ts → Lua + packages .aseprite-extension
  lua/
    package.json         extension manifest (contributes.scripts → main.lua)
    main.lua             plugin: init/newCommand registers File ▸ Scripts ▸ Export…,
                         flattens the sprite, calls the generated module, then saves
                         via a native dialog or copies to the clipboard (pure Lua, no binary)
```

## Testing

`bun test` runs the [Vitest](https://vitest.dev/) suite (162 tests across 8 files),
covering the pure logic that's most worth a safety net:

- [`src/lib/grid.test.ts`](src/lib/grid.test.ts) — immutable cell writes, flood-fill
  contiguity (and filling transparent regions), and tight content bounds.
- [`src/lib/svg.test.ts`](src/lib/svg.test.ts) — greedy meshing (merging, transparency,
  the exact-cover / no-overlap invariant, and crop bounds), color grouping, the SVG
  `viewBox` / transparent output, and the shape of the generated React component.
- [`src/lib/compose.test.ts`](src/lib/compose.test.ts) — layer compositing: Porter-Duff
  alpha-over, per-layer opacity, visibility toggle, and multi-layer blending.
- [`src/lib/storage.test.ts`](src/lib/storage.test.ts) — project save/load round-trips,
  schema validation, and migration of the old pre-layer flat-grid format.
- [`src/lib/aseprite.test.ts`](src/lib/aseprite.test.ts) — `.ase`/`.aseprite` parser
  coverage: headers, frames, layer chunks, and cel decoding.
- [`src/state/useEditor.test.ts`](src/state/useEditor.test.ts) — reducer action coverage
  for frame and layer operations, undo/redo, and selection logic.
- [`aseprite-ext/lua-src/export.parity.test.ts`](aseprite-ext/lua-src/export.parity.test.ts)
  — runs the generated Lua in a Lua 5.4 VM (wasmoon) and asserts its SVG output is
  byte-identical to `svg.ts`, so the two can't silently drift.

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint + tests + build on
every push and PR.

## Deployment (GitHub Pages)

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds and publishes to
GitHub Pages on every push to `main`. It runs the tests first (a red suite blocks the
deploy) and derives the Vite `base` path from the repository name automatically — nothing
to hardcode.

To go live:

1. Push this repo to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main` — the site deploys to `https://<user>.github.io/<repo>/`.

For a local production build under a custom path, override the base:

```bash
VITE_BASE=/my-repo/ bun run build
```

## Aseprite Extension

The `aseprite-ext/` folder contains a standalone Aseprite extension that exports the
active sprite as an optimized SVG **and** a typed React component — using the exact same
greedy-mesh algorithm as the web app. It's **pure Lua** (~20 KB), so it installs in one
step and runs identically on Windows, macOS, and Linux — no binary, no security prompts.

**Install (for users):**

1. Download `8bitsvg.aseprite-extension` from the
   [latest release](https://github.com/MadeOfBees/8BitSVG/releases/latest).
2. In Aseprite: **Edit ▸ Preferences ▸ Extensions ▸ Add Extension** (or just double-click
   the file). 
3. Use it from **File ▸ Scripts ▸ Export as SVG + React…** — pick a name and format, then
   either **Save to file** (native dialog) or **Copy to clipboard**.

**Build (for contributors):**

```bash
bun run build:ext
# → aseprite-ext/dist/8bitsvg.aseprite-extension  (~20 KB, pure Lua)
```

**How the DRY sharing works:** the algorithm has a single source of truth in
`src/lib/svg.ts`. `aseprite-ext/lua-src/export.ts` re-exports it, and `build.ts` runs
[TypeScriptToLua](https://typescript-to-lua.github.io/) to transpile it into
`svg.generated.lua`, which the Lua wrapper (`main.lua`) loads. Edit `svg.ts`, run
`bun run build:ext`, and the web app and extension stay in sync. A test
(`aseprite-ext/lua-src/export.parity.test.ts`) runs the generated Lua in a Lua 5.4 VM
and asserts its output is byte-identical to `svg.ts`, so the two can't silently drift.

## Contributing

`bun test` is the fast gate — run it before every push; it's what CI runs first. For UI changes, verify by eye in the browser.

## License

[AGPL v3](LICENSE).
