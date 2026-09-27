# CLIP Cut Rule — SHEET vs ALIGN vs CLIP

SHEET = layout + export only. ALIGN = anchor, offset, timing, stack, play.
CLIP = presets + stamp + frameMs + undo-ms-snapshot + clipRead.

## Ownership

| Area | Owner | Files |
|------|-------|-------|
| frameAnchor kernel, computeSheet, packer/bleed, LAYOUT + EXPORT secs, sheetView/playerPanel, state.sheet + state.player fields | SHEET | js/30-sheet.js, js/50-app.js (export + sheet controls), js/52-zip.js, index.html LAYOUT/EXPORT |
| renderAlignView, alignInfos, stackState, drawStack, nudge/offset, drawFa pivot editor, TIMING + STACK + ANCHORING secs, align keys | ALIGN | js/31-stack.js, js/32-align.js, index.html alignView + frameSec + stackSec |
| CLIP_PRESETS, frameMs (hoisted global), stampPattern, applyClipPreset, getClipInfo, snapshot/restore, clipRead | CLIP | js/33-clip.js (loads between 32 and 40) |

## Observer rule

SHEET never references ALIGN or clip internals. ALIGN + CLIP call
`invalidateSheet()` guarded by `typeof`, and render via `typeof`-guarded
`renderTray` / `drawFa` / `renderStackPanel` / `renderAlignView`.

## Reserved IDs (verified zero collisions 2026-09-04)

`clipSec`, `clipPresetSeg`, `clipRead`, `clipTotal` — grep over
`index.html` + `js/*.js` returns no hits before T4 lands them.

## Notes

- `tool.html` is frozen reference — never edit (checksum unchanged).
- Tray order == `state.frames` order == export/player order.
- Only `spritelloom` atlas keeps `duration`; other formats strip it (unchanged).
