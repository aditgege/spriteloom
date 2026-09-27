# SpriteLoom — Spritesheet Studio for AI Pixel Art

> AI sprites in. Clean spritesheets out. Recover pixel grid → curate frames → anchored export.

Pure-split refactor dari `tool.html` (4604 lines) — no build, no bundler, jalan dari `file://`.

---

## Daftar Isi
- [Cara Run](#cara-run)
- [Cara Pakai (4 Langkah)](#cara-pakai-4-langkah)
- [Export](#export)
- [CLI / Node (tanpa browser)](#cli--node-tanpa-browser)
- [Struktur File & Load Order](#struktur-file--load-order)
- [Cara Push ke GitHub](#cara-push-ke-github)
- [Requirements](#requirements)

---

## Cara Run

### Opsi A — Browser (paling gampang, tanpa install)

```bash
# tidak butuh npm / server
# tinggal double-click index.html
```

Buka `index.html` langsung dari file explorer. Jalan di `file://` pakai classic scripts saja (`docs/adr/0001-vanilla-classic-scripts-for-file-compat.md`). Internet hanya untuk Google Fonts + Lucide CDN, semua logic app lokal.

> Kalau mau serve via HTTP juga bisa:
> ```bash
> npx serve .
> # atau
> python -m http.server 8000
> # buka http://localhost:8000
> ```

### Opsi B — CLI Node (batch / AI pipeline)

```bash
npm install          # install pngjs ^7.0.0 (satu-satunya dependency)
node cli.mjs --help  # cek usage + exit codes (0 ok, 1 runtime, 2 usage)
```

### Opsi C — Watch Folder (auto-snap tiap file masuk)

```bash
node watch.mjs ./in ./out --k 12 --dither
```

---

## Cara Pakai (4 Langkah)

Alur di topbar: `01 SNAP → 02 FRAMES → 03 SHEET → 04 ALIGN`

### 01 · SNAP — Recover Pixel Grid
1. Upload gambar via **Upload images** / **drag & drop** / **paste (Ctrl+V)** di mana saja. Atau klik **Try the demo batch**.
2. Lihat split view: kiri = SOURCE, kanan = SNAPPED. Drag divider untuk compare, double-click untuk flip.
3. Di inspector kanan:
   - **GRID DETECTION**: mode `Auto` (deteksi pitch/offset otomatis) atau `Manual` (isi Pitch X/Y & Offset X/Y).
   - **X PITCH / Y PITCH**: klik chip kandidat kalau auto kurang pas.
   - **PALETTE (K-MEANS)**: slider `COLORS` 2–24, atau isi `CUSTOM PALETTE` hex `0d2b45,ffecd6` lalu **Apply** / **Clear**. Centang `Dither` untuk center-sample, tombol `Lock pixel size` untuk kunci ukuran.
   - Checkbox `Snap cuts to edge peaks` untuk snap potongan ke tepi tajam.
4. Klik **Extract frames →** untuk lanjut.

> Tips: kalau muncul warning kuning "No repeating grid found", coba Manual pitch atau naikkan palette size.

### 02 · FRAMES — Extract & Curate
- **Auto-slice**: deteksi region otomatis → klik **Add frames**. Paling cepat kalau grid sudah snap.
- **Grid**: isi Columns/Rows (mis. 4×4) → **Slice grid**.
- **Marquee**: drag di canvas untuk crop (snap ke grid), lalu **Enter** atau tombol floating **Add**.

Frame hasil masuk ke **FRAME TRAY** di bawah. Drag untuk reorder, `Del` untuk hapus, `Ctrl+Z` untuk undo. Klik **Arrange sheet →** kalau sudah puas.

### 03 · SHEET — Layout & Anchoring
- **LAYOUT**: atur Columns, Cell (Auto/Manual + Cell W/H), Spacing, Margin, Scale 1×/2×/4×/8×. Preset cepat: `16px·4×4`, `32px·8×4`, `64px·4×2`. Packer `Grid` / `MaxRects`, opsi `1px bleed extrude`.
- **ANCHORING**: pilih 9 titik anchor (TL, TC, TR, ML, MC, MR, BL, BC, BR) — default `BOTTOM CENTER`. Centang `Trim to content` biar anchor nempel ke konten visible, bukan kotak canvas.
- **FRAME (klik cell di sheet)**: rename, atur Duration (ms) + preset 50/80/125/250/500, scale per-frame (×1 dst), offset X/Y + nudge ◀▶▲▼, klik preview untuk set pivot. Tombol **Match sheet anchor** & **Export frame.png**.
- **STACK**: semua frame ditumpuk di anchor yang sama — yang aktif opaque di atas, sisanya ghost tinted. Atur ghost opacity & tint, reorder dengan ↑↓.
- **CLIP**: urutan tray = clip. Preset `Breathe / Blink / Walk / Run / Attack / Hit` untuk stamp durasi.
- **PLAYER (RUNTIME CHECK)**: preview animasi dengan FPS 1–24, onion skin, prev/play/next.

### 04 · ALIGN — Polish Satu Clip
Stack + Play mode. Nudge frame aktif dengan arrow keys (Shift ×5), atur FPS & onion skin. Untuk polish akhir sebelum export.

### Tray & Topbar
- **Topbar**: `Save` / `Load` project JSON, `Export PNG` (disabled kalau 0 frame).
- **Rail kiri**: list SOURCES + counter, tombol **Add images**.
- **Tray bawah**: `Undo`, `Clear`, `Dup sel`, `Del sel`, `Rename` (bulk).

---

## Export

Di panel **EXPORT** (Sheet view):

| Tombol | Hasil |
|---|---|
| **Export PNG** | spritesheet PNG (transparent/solid + pilih bg color) |
| **Export JSON atlas** | atlas JSON `{ frames: { name: {x,y,w,h} }, meta: {…} }` untuk engine (Godot/Phaser/dll) |
| **Download ZIP (frames)** | ZIP berisi frame-frame individual (via `js/52-zip.js`) |

Per-frame juga bisa **Export frame.png** dari panel FRAME.

---

## CLI / Node (tanpa browser)

`core.mjs` itu DOM-free — aman di `file://` maupun Node. CLI cuma butuh `pngjs`.

### Single file

```bash
node cli.mjs input.png output.png --k 12 --palette 0d2b45,ffecd6 --dither --pixel-size 8
```

| Flag | Arti | Default |
|---|---|---|
| `--k <n>` | jumlah warna quantize 2–24 | `8` |
| `--palette <hex>` | palette custom `#` opsional, 3/6 digit, comma-sep `0d2b45,ffecd6` | - |
| `--dither` | center-sample tiap cell (default majority vote) | `false` |
| `--pixel-size <n>` | upscale nearest-neighbor hasil snap | `1` |

### Batch via job.json

```bash
node cli.mjs --job job.json
```

```json
{
  "inputs": ["in/a.png", "in/b.png"],
  "outDir": "out",
  "k": 12,
  "palette": "0d2b45,ffecd6",
  "dither": true,
  "pixelSize": 8
}
```

### Watch folder

```bash
node watch.mjs ./in ./out --k 12 --dither --pixel-size 8
# watching C:\...\in -> C:\...\out (k=12 dither=true pixelSize=8)
# ok foo.png -> out/foo.png (16x16 pitch 8x8)
```

### MCP Server (untuk AI agent)

```bash
node mcp.mjs
# stdio JSON-RPC, tool: pixel_snap { imageBase64, k, palette, dither, pixelSize }
```

Memanggil `core.snapImageData({width,height,data: Uint8ClampedArray}, {k,palette,dither})` di balik layar via `PNG.sync.read/write`.

---

## Struktur File & Load Order

```
index.html                 # shell: topbar, rail, workspace (dropHero/snap/frames/sheet/align), inspector, tray
styles/base.css            # tokens, reset, buttons, inputs, scrollbars, topbar
styles/layout.css          # main grid, rail, workspace, canvas wraps, checker
styles/views.css           # hero, split view, sheet+player, inspector, tray, toasts, veil
js/00-utils.js             # $/$$/el/clamp/num/uid/mulberry32/debounce/icons/loadImage/downloadBlob/toast
js/01-state.js             # ANCHORS/ANCHOR_LABELS/state/curSrc/selFrameObj/view caches/dropLine
js/10-kmeans.js            # k-means quantization: kmeansHist + quantizeImageData
js/11-snap.js              # snap pipeline: profiles/peaks/pitch/offset/cuts/resample/runSnap + split view
js/12-sources.js           # frame bake + autoslice/grid + intake + demo art + hero + source bg + final createFrame
js/20-frames.js            # frames view: render/overlay/marquee/autoslice wiring
js/30-sheet.js             # sheet layout/anchoring/player/pivot editor
js/31-stack.js             # stack overlay (ghost/tint)
js/32-align.js             # align workflow (stack vs play, nudge)
js/33-clip.js              # clip presets (Tray-is-Clip, stamp ms)
js/40-tray.js              # frame tray: undo/select/duplicate/delete/render/drag
js/50-app.js               # rail/chrome/export/loop/wiring/init
js/51-wiring.js            # extra wiring
js/52-zip.js               # ZIP export frames
js/53-save.js              # Save/Load project JSON
core.mjs                   # DOM-free core (kmeans + snap pipeline) untuk Node/CLI/MCP
cli.mjs                    # CLI wrapper (pngjs)
watch.mjs                  # watcher inDir -> outDir
mcp.mjs                    # MCP stdio server (tool pixel_snap)
CONTEXT.md                 # glossary (Source/Frame/Sheet/Cell/Anchor/Pitch/Pivot/Tray)
docs/adr/0001-vanilla-classic-scripts-for-file-compat.md
```

**Load order — jangan diubah!** CSS: `base → layout → views`. JS (`defer`, classic scripts, numeric):

```
00-utils → 01-state → 10-kmeans → 11-snap → 12-sources → 20-frames →
30-sheet → 31-stack → 32-align → 33-clip → 40-tray → 50-app → 51-wiring → 52-zip → 53-save
```

File belakang memanggil global dari file depan saat load (`pitchChip`, `makeDemo`, `heroStep`, `createFrame`, `getAutoslice`, `renderRail`, …). Jangan convert ke ES module.

### Parity note
- Body `index.html` identik byte-for-byte dengan `../tool.html` (ID DOM sama), beda hanya `<style>` → 3 link CSS dan `<script>` → `defer` tags.
- `base + layout + views` concatenated = `<style>` original (hanya normalisasi 2 baris kosong).
- JS concatenated numeric order = `<script>` original. Gap yang sudah fix: baris 2325–2980 (`createFrame` draft 2417–2446, `autoSlice`/`getAutoslice`/`gridRegions`, intake, demo painters + `makeDemo`, hero `HERO_FRAMES`/`heroBufs`/`colorBounds`/`heroStep`, `sourceBgKey` + final `createFrame` 2951–2980) sekarang di `js/12-sources.js`.

---

## Cara Push ke GitHub

> Ganti `aditgege` kalau username beda. Pastikan repo `spriteloom` sudah dibuat di https://github.com/new (jangan centang Initialize).

### Skenario A — Push dari repo lokal yang sudah ada (kasus kamu sekarang)

Kamu sudah `git init` + commit di `C:\FileAdit\Adit\gamedev\tools\spritelloom` (branch `master`). Tinggal sambung remote & push:

```bash
cd "C:\FileAdit\Adit\gamedev\tools\spritelloom"

# 1. cek status & remote sekarang
git status
git remote -v

# 2. sambungkan ke GitHub (kalau belum ada remote)
git remote add origin https://github.com/aditgege/spriteloom.git
# kalau sudah ada tapi salah URL:
# git remote set-url origin https://github.com/aditgege/spriteloom.git

# 3. rename branch ke main (GitHub default) + push
git branch -M main
git push -u origin main
```

Masukkan username + Personal Access Token (PAT) saat diminta password. Buat PAT di https://github.com/settings/tokens (classic, scope `repo`).

Verifikasi:

```bash
git remote -v
# origin  https://github.com/aditgege/spriteloom.git (fetch)
# origin  https://github.com/aditgege/spriteloom.git (push)
git log --oneline -5
```

### Skenario B — Buat repo baru dari nol (command line)

```bash
echo "# spriteloom" >> README.md
git init
git add README.md
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/aditgege/spriteloom.git
git push -u origin main
```

### Skenario C — Update setelah ada perubahan

```bash
cd "C:\FileAdit\Adit\gamedev\tools\spritelloom"
git add .
git commit -m "docs: update README panduan pakai & push"
git push
# kalau branch masih master:
# git push -u origin master
```

### Troubleshooting

| Error | Solusi |
|---|---|
| `remote origin already exists` | `git remote set-url origin https://github.com/aditgege/spriteloom.git` |
| `failed to push, authentication failed` | pakai PAT bukan password; atau `gh auth login` kalau pakai GitHub CLI |
| `src refspec main does not match any` | belum commit: `git add . && git commit -m "init"` dulu |
| `! [rejected] (fetch first)` | `git pull --rebase origin main` lalu `git push` |
| Mau pakai SSH | `git remote set-url origin git@github.com:aditgege/spriteloom.git` |

---

## Requirements

- Browser modern (Chrome/Edge/Firefox) — tidak butuh build tool.
- Node.js 18+ kalau pakai CLI/watch/MCP (butuh `pngjs`).
- Tidak ada native deps / canvas — semua pure JS.

## License

MIT — lihat file LICENSE (kalau belum ada, anggap MIT).
