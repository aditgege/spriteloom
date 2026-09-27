# ADR 0002 — UI Wiring Wave-2 (Wire Wave-1 APIs to DOM)

## Context

Wave-1 added headless JS APIs with no DOM surface: marquee preview flow
(20-frames), `parsePaletteHex` / `applyCustomPalette` / resample mode /
`lockPixelSize` (10/11), `computeSheetSize` / `clampSheetCache` /
`sheetWarning` / `applySheetPreset` (30), extended undo + keyboard +
`batchSnapAll` + `persistPrefs` (40/50). Users could not reach any of them
from the inspector. Classic scripts, `file://` safe, no build step.

## Decision

- Snap inspector gains a custom-palette text field (`#paletteHex`) with
  Apply/Clear, a dither checkbox (`#ditherToggle`), and a pixel-lock button
  (`#pixelLockBtn`); all reuse existing `.field` / `.flabel` / `.btn` /
  `.check` classes.
- Sheet inspector gains a preset segment (`#presetSeg`, 3 buttons) and an
  overflow warning div (`#sheetWarn`, `.warnnote`); the frames inspector
  gains a batch re-snap button (`#batchSnapBtn`).
- All new event wiring lives in a new `js/51-wiring.js` (DOM only, no
  algorithms), loaded via `<script defer>` AFTER `js/50-app.js`.
  `js/50-app.js` is untouched: `init()` + the `tick` loop stay there, as do
  all existing wirings; wave-1 algorithm logic is unchanged.
- Palette Apply parses via `parsePaletteHex`, stores the array on
  `curSrc().params.palette`, then `rerunSnap` + toast; Clear nulls it.
  Dither toggles `params.dither` + `rerunSnap`. Pixel-lock calls
  `lockPixelSize(curSrc)` + mode-segment sync + `syncSnapUI` + `rerunSnap`.
  Presets call `applySheetPreset` + input sync + `persistPrefsD` +
  `sheetWarning` into `#sheetWarn`. Batch calls `batchSnapAll`.
- Wave-2 prefs (palette text, dither flag) persist under a separate guarded
  `localStorage` key; existing prefs key/behavior unchanged.

## Consequences

- Marquee, palette, dither, batch, overflow warning, undo/keys, presets, and
  prefs are all reachable from the UI with unique IDs and no broken wiring.
- Script order is `00,01,10,11,12,20,30,40,50,51`; later files may call
  earlier globals at load; no modules, no npm, `file://` intact.
- Risk: `syncSnapUI` (11) does not know the new checkbox, so 51 re-syncs it
  on rail selection; if new controls are renamed, 51 must follow.
