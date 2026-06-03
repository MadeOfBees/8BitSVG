<div align="center">

# 8BitSVG

[![CI](https://img.shields.io/github/actions/workflow/status/MadeOfBees/8BitSVG/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/MadeOfBees/8BitSVG/actions/workflows/ci.yml)
[![Live demo](https://img.shields.io/badge/demo-live-brightgreen?style=flat-square)](https://madeofbees.github.io/8BitSVG/)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?style=flat-square&logo=pwa)](https://madeofbees.github.io/8BitSVG/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![GitHub Stars](https://img.shields.io/github/stars/MadeOfBees/8BitSVG?style=flat-square)](https://github.com/MadeOfBees/8BitSVG/stargazers)
[![License](https://img.shields.io/github/license/MadeOfBees/8BitSVG?style=flat-square)](LICENSE)

**Draw pixel art in the browser, crop it, and export a clean transparent SVG, a pasteable React component, or a PNG — 100% in your browser.**

[**▶ Open the live demo**](https://madeofbees.github.io/8BitSVG/)

</div>

Paint on a grid with as many colors as you like, drag a crop box around the part you want,
and export a tidy transparent-background SVG whose rectangles are merged down to the fewest
shapes — or a one-click React component of the same art, or a 1 px-per-cell PNG you can
reimport later to keep working.

It runs entirely in the browser. No backend, no accounts; your current drawing is
autosaved to `localStorage` so a refresh never loses work. A service worker pre-caches
all assets so the app loads fully offline after the first visit.

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
- [Contributing](#contributing)
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
  `<rect>`s; colors with multiple rects are wrapped in `<g fill="…">` so each hex
  appears exactly once in the output. **Transparent by construction** — no background
  rect is ever emitted.
- ⚛️ **React export** — the same art wrapped as a typed, prop-spreading `.tsx` component.
- 🖼️ **PNG round-trip** — export the cropped region as a 1 px-per-cell transparent PNG;
  re-import it later via File → Import PNG to restore the drawing and keep working.
- 💾 **Copy or download** — grab the SVG/component to the clipboard, or download a
  `.svg` / `.tsx` / `.png` file.
- ↩️ **Undo / redo** — per-stroke history (up to 100 steps).
- 🔍 **Zoom** — buttons, keyboard, or scroll-wheel anywhere over the workspace.
- 📶 **Offline / installable** — a service worker pre-caches all assets; the app loads
  fully offline after the first visit. PWA install prompt available in Chrome, Edge, and
  Safari.
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
   │  then group by color → each hex once via <g fill="…">
   ▼
SVG string  ──or──▶  React component  ──or──▶  PNG (1px/cell, transparent)
                                                  │
                                                  ▼
                                         File → Import PNG  (round-trip)
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
| Arrow keys | Move grid (one cell per press) | scroll wheel | Zoom (over the workspace) |

Shortcuts are ignored while you're typing in an input or textarea.

## Tech stack

- [Vite 8](https://vitejs.dev/) + [React 19](https://react.dev/) + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com/) (CSS-first, via `@tailwindcss/vite`)
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) for service worker + offline caching
- [react-icons](https://react-icons.github.io/react-icons/) (Lucide set) for the
  monochrome tool icons
- [Monocraft](https://github.com/IdreesInc/Monocraft) for the pixel font
- [Vitest](https://vitest.dev/) for unit tests

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
    svg.ts               greedyMesh → groupByColor → SVG string / React component
    storage.ts           debounced load/save of the persisted project
  components/
    Canvas.tsx           the drawing canvas: checkerboard, pointer drawing (Bresenham
                         line-fill), move-grid drag, wheel-to-zoom
    Toolbar.tsx          tools, size presets, undo/redo, zoom, clear, export, PNG import
    ColorPanel.tsx       color picker + validated hex field + saved swatches
    ExportModal.tsx      drag-to-crop preview + SVG / React / PNG tabs + copy / download
    KeyboardShortcuts.tsx  global keydown handler (renders nothing)
  index.css              Tailwind v4 entry + Monocraft @font-face + crisp-pixel resets
```

## Testing

`npm test` runs the [Vitest](https://vitest.dev/) suite (32 tests), which covers the pure
logic that's most worth a safety net — the grid model and the SVG exporter:

- [`src/lib/grid.test.ts`](src/lib/grid.test.ts) — immutable cell writes, flood-fill
  contiguity (and filling transparent regions), and tight content bounds.
- [`src/lib/svg.test.ts`](src/lib/svg.test.ts) — greedy meshing (merging, transparency,
  the exact-cover / no-overlap invariant, and crop bounds), color grouping, the SVG
  `viewBox` / transparent output, and the shape of the generated React component.

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

## Contributing

`npm test` is the fast gate — run it before every push; it's what CI runs first. For UI changes, verify by eye in the browser.

## License

[MIT](LICENSE).
