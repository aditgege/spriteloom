# ADR 0001 — Vanilla Classic Scripts for File Compatibility

## Context

SpriteLoom is a single-file pixel-art tool (`tools/tool.html`, 4604 lines, frozen as reference)
split into `tools/spritelloom/` (HTML shell + split CSS/JS) for maintainability.
The tool must keep working by double-click from the filesystem (`file://`) with no
build step, no server, and no install, since artists open it directly.

## Decision

Keep the split as vanilla HTML + CSS + classic (non-module) scripts loaded with
`defer` in numeric filename order. No imports, no exports, no bundler, no npm.
Shared state lives on globals in load order; each `js/` file is a verbatim slice
of the original `<script>` (dedented to top level where applicable).

## Alternatives

- **Vite + TypeScript build**: rejected — requires `npm install` and a dev server /
  build step, breaking double-click `file://` use and adding toolchain upkeep for
  a dependency-free tool.
- **ES modules (`type="module"` + `import/export`)**: rejected — module CORS rules
  block `import` under `file://` in browsers, so the split would fail when opened
  by double-click; classic scripts execute fine.

## Consequences

- `index.html` must keep the `<script src="js/..." defer>` tags in numeric order
  (`00, 01, 10, 11, 12, 20, 30, 40, 50`); reordering or converting to modules breaks load.
- New code must use globals only — no `import`/`export`, no npm packages.
- Parity rule: `styles/*.css` concatenated (normalizing only the 2 blank separator
  lines) must equal the original `<style>`; `js/` concatenated in numeric order must
  equal the original `<script>` logically (duplicate `createFrame` draft + final kept).
- Reference `tools/tool.html` is never edited; it is the byte-compare baseline.
