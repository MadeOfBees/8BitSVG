<div align="center">

# 8bitsvg

**Draw pixel art in the browser, crop it, and export a clean transparent SVG — or a pasteable React component.**

</div>

8bitsvg is a tiny pixel-art editor that treats the *SVG* as the product. Paint on a
grid with as many colors as you like, drag a crop box around the part you want, and it
emits a tidy, transparent-background SVG whose rectangles are merged down to the fewest
shapes — plus a one-click React component of the same art.

It runs entirely in the browser. No backend, no accounts; your current drawing is
autosaved to `localStorage` so a refresh never loses work.

---

## Contents

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
- [License](#license)

## Features

- ✏️ **Five tools** — pencil, eraser, flood-fill bucket, eyedropper, and a move tool
  that slides the whole grid around the workspace.
- 🎨 **Unlimited colors** — a full color picker (with a validated hex field) plus a row
  of saved swatches; right-click a swatch to remove it.
- 🔲 **Fixed-size canvases** — 8², 16², 32², or 64² presets, with a checkerboard that
  signals transparency.
- ✂️ **Drag-to-crop on export** — draw a crop box over a live preview; "Fit to content"
  snaps it to the painted bounds.
- 🧩 **Optimized SVG** — adjacent same-color cells are greedy-meshed into the fewest
  `<rect>`s, so the output is small and clean, with a **transparent background by
  construction** (no background rect is ever emitted).
- ⚛️ **React export** — the same art wrapped as a typed, prop-spreading `.tsx` component.
- 💾 **Copy *or* download** — grab the SVG/component to the clipboard, or download a
  `.svg` / `.tsx` file.
- ↩️ **Undo / redo** — per-stroke history (up to 100 steps).
- 🔍 **Zoom** — buttons, keyboard, or scroll-wheel anywhere over the workspace.
- 🕹️ **Sharp & retro** — a pixel font ([Monocraft](https://github.com/IdreesInc/Monocraft)),
  monochrome line icons, hard corners, and crisp-edge rendering throughout.

## How it works

```text
draw on the grid
   │  each cell → a hex color, or null = transparent   (flat width×height array)
   ▼
crop to a region (drag a box, or fit-to-content)
   │
   ▼
greedy-mesh the painted cells into the fewest <rect>s
   ▼
transparent-background SVG   ──or──▶   pasteable React component
```

A few deliberate choices worth calling out:

- **The SVG is the product, and it's optimized.** Rather than emitting one `<rect>` per
  pixel, [`greedyMesh`](src/lib/svg.ts) expands each unvisited painted cell as far right
  as the color holds, then as far down as the full span matches, and marks the block
  visited — the classic greedy-meshing approach. The result covers every painted cell
  exactly once with no overlap (an invariant the tests assert) using far fewer shapes.

- **Transparent by construction.** No background rectangle is ever written, and the
  `viewBox` is the crop size, so the exported SVG is transparent wherever you didn't
  paint. The editor's checkerboard is purely a visual cue — it never makes it into the
  output.

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
| `G` | Fill bucket | `+` / `=` | Zoom in |
| `I` | Eyedropper | `-` | Zoom out |
| `V` / `M` | Move grid | scroll wheel | Zoom (over the workspace) |
| Arrow keys | Move grid (one cell per press) | | |

Shortcuts are ignored while you're typing in an input or textarea.

## Tech stack

- [Vite 8](https://vitejs.dev/) + [React 19](https://react.dev/) + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com/) (CSS-first, via `@tailwindcss/vite`)
- [react-icons](https://react-icons.github.io/react-icons/) (Lucide set) for the
  monochrome tool icons
- [Monocraft](https://github.com/IdreesInc/Monocraft) for the pixel font
- [Vitest](https://vitest.dev/) for unit tests, and [Playwright](https://playwright.dev/)
  for on-demand visual checks

## Requirements

- **To use it:** any modern browser. Drawing uses a 2D `<canvas>`; clipboard export uses
  the async Clipboard API.
- **To develop it:** **Node 20.19+** (or 22.12+) — Vite 8's requirement.

## Getting started

```bash
npm install
npm run dev      # start the dev server at http://localhost:5173
```

## Commands

```bash
npm run dev          # dev server with HMR → http://localhost:5173
npm run build        # type-check (tsc -b) + production build to dist/
npm run preview      # serve the production build locally
npm run lint         # ESLint

npm test             # unit tests (Vitest)
npm run test:watch   # Vitest in watch mode
```

There's also a visual-check harness, [`scripts/shot.mjs`](scripts/shot.mjs): it boots the
dev server, paints a few cells, opens the export modal, and writes `scripts/shot-page.png`
and `scripts/shot-modal.png`. Run it with `node scripts/shot.mjs` (first run only:
`npx playwright install chromium`). The screenshots are gitignored.

## Project structure

```text
src/
  App.tsx                top-level layout: header, toolbar, canvas, color panel, modal
  types.ts               Grid / Cell / Tool / Bounds / Project types + size presets
  state/
    useEditor.tsx        useReducer editor store (grid, tool, color, zoom) + history,
                         exposed via context; debounced localStorage autosave
  lib/
    grid.ts              create / clone / index helpers, floodFill, contentBounds
    svg.ts               greedyMesh → SVG string → pasteable React component
    storage.ts           debounced load/save of the persisted project
  components/
    Canvas.tsx           the drawing canvas: checkerboard, pointer drawing (Bresenham
                         line-fill), move-grid drag, wheel-to-zoom
    Toolbar.tsx          tools, size presets, undo/redo, zoom, clear, export
    ColorPanel.tsx       color picker + validated hex field + saved swatches
    ExportModal.tsx      drag-to-crop preview + SVG / React tabs + copy / download
    KeyboardShortcuts.tsx  global keydown handler (renders nothing)
  index.css              Tailwind v4 entry + Monocraft @font-face + crisp-pixel resets
scripts/
  shot.mjs               Playwright visual-check harness (writes shot-*.png)
```

## Testing

`npm test` runs the [Vitest](https://vitest.dev/) suite, which covers the pure logic
that's most worth a safety net — the grid model and the SVG exporter:

- [`src/lib/grid.test.ts`](src/lib/grid.test.ts) — immutable cell writes, flood-fill
  contiguity (and filling transparent regions), and tight content bounds.
- [`src/lib/svg.test.ts`](src/lib/svg.test.ts) — greedy meshing (merging, transparency,
  the exact-cover / no-overlap invariant, and crop bounds), the SVG `viewBox` /
  transparent output, and the shape of the generated React component.

The UI itself is checked by eye with `scripts/shot.mjs` (see [Commands](#commands)).

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
VITE_BASE=/my-repo/ npm run build
```

## License

[MIT](LICENSE).
