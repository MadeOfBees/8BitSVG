# Changelog

All notable changes to this project are documented here.

## [0.2.0] - 2026-06-06

### Added

- **Layers** — each frame holds a stack of independent layers. Add, delete, reorder
  (up/down), duplicate, rename (double-click), and toggle visibility per layer.
  Per-layer opacity slider (0–255). Edit menu layer group: Duplicate Layer,
  Merge Down, Flatten All Layers.
- **Layer Panel** — new right-sidebar panel showing the layer stack top-to-bottom
  with live 28 px canvas thumbnails, an eye-toggle for visibility, and an opacity
  slider on the active layer.
- **Layer compositing** (`src/lib/compose.ts`) — visible layers are composited
  bottom-to-top using Porter-Duff alpha-over with per-layer opacity before being
  sent to the canvas renderer or any export path. Blend mode is stored on each
  layer and round-trips through `.aseprite`; Normal mode is applied during
  compositing.
- **Foreground + background color pair** — overlapping FG/BG chips in the Color
  panel. Swap with the Swap button or `X`. Reset to black/white with the Reset
  button or `D`.
- **Per-color alpha** — foreground color alpha is editable via a 0–255 slider and
  8-digit `#rrggbbaa` hex values. Alpha-transparent colors composite correctly
  against layers below.
- **GitHub Release workflow** (`.github/workflows/release.yml`) — pushing a `v*`
  tag runs the test suite, builds the Aseprite extension, and attaches
  `8bitsvg.aseprite-extension` to the GitHub Release automatically.
- `activeLayer` and `backgroundColor` are now persisted to and restored from
  `localStorage` as part of the project snapshot.
- `TOPICS.md` — curated list of recommended GitHub repository topics with rationale.

### Changed

- **Data model** — all application state now uses `FrameData` (with a `layers[]`
  array) instead of a flat `Grid`. The `Grid` type is retained as the composited
  output surface consumed by `svg.ts` and the canvas renderer.
- **Frame thumbnails** — the timeline strip now composites all visible layers before
  rendering each thumbnail, rather than reading a single flat cell array.
- **Transforms** — flip, rotate, and crop-to-selection now apply correctly across
  all layers (whole-frame transform) or to the selected region of the active layer
  only (selection transform).
- **Undo/redo** — history snapshots now record `activeLayer` alongside frame state,
  so undo correctly restores the layer that was active at the time of the stroke.
- **CI** (`.github/workflows/ci.yml`) — the check pipeline now type-checks
  (`bunx tsc --noEmit`) and builds (`bun run build:ext`) the Aseprite extension on
  every push, so a breaking change in `svg.ts` can't silently break the extension.
- **Storage** — `loadProject()` validates the new layer structure and silently
  discards the old pre-layer flat-`Grid` format; existing saves start fresh rather
  than crashing on a schema mismatch.
- Test suite expanded from 32 to 162 tests across 8 files — `compose.test.ts`,
  `storage.test.ts`, `useEditor.test.ts`, and `aseprite.test.ts` added alongside
  the existing grid and SVG tests.
