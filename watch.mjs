#!/usr/bin/env node
// SpriteLoom watcher — watches inDir for new/changed PNGs, snaps each to outDir.
// DOM-free Node (file:// safe, no canvas). Same core.snapImageData path as cli.mjs.
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import * as core from "./core.mjs";

const HELP = `spritelloom watcher — snap new PNGs on arrival (core.mjs + pngjs)

Usage:
  node watch.mjs <inDir> <outDir> [opts]
  node watch.mjs --help

Opts (same mapping as cli.mjs -> snapImageData):
  --k <n>            quantization colors 2..24 (default 8)
  --palette <hex>    custom palette "0d2b45,ffecd6"
  --dither           center-sample cells (else majority vote)
  --pixel-size <n>   nearest-neighbor upscale of snapped output (default 1)

Example:
  node watch.mjs ./in ./out --k 12 --palette 0d2b45,ffecd6 --dither --pixel-size 8
`;

function fail(msg, code = 1) {
  process.stderr.write(`watch: ${msg}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const o = { positional: [], k: 8, palette: null, dither: false, pixelSize: 1, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--k") o.k = Number(argv[++i] ?? fail("missing value for --k", 2));
    else if (a === "--palette") o.palette = argv[++i] ?? fail("missing value for --palette", 2);
    else if (a === "--dither") o.dither = true;
    else if (a === "--no-dither") o.dither = false;
    else if (a === "--pixel-size" || a === "--pixelSize") o.pixelSize = Number(argv[++i] ?? fail("missing value for --pixel-size", 2));
    else if (a.startsWith("--pixel-size=")) o.pixelSize = Number(a.split("=")[1]);
    else if (a.startsWith("--k=")) o.k = Number(a.split("=")[1]);
    else if (a.startsWith("--palette=")) o.palette = a.split("=").slice(1).join("=");
    else if (a.startsWith("-")) fail(`unknown flag ${a} (see --help)`, 2);
    else o.positional.push(a);
  }
  return o;
}

function snapFile(inPath, outPath, opts) {
  const buf = fs.readFileSync(inPath);
  const src = PNG.sync.read(buf);
  const img = { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) };
  const k = Number.isFinite(Number(opts.k)) ? Math.max(2, Math.min(24, Math.round(Number(opts.k)))) : 8;
  const res = core.snapImageData(img, { k, palette: opts.palette, dither: !!opts.dither });
  let finalImg = res.out;
  const f = Math.floor(Number(opts.pixelSize));
  if (f > 1) {
    const up = { width: finalImg.width * f, height: finalImg.height * f, data: new Uint8ClampedArray(finalImg.width * f * finalImg.height * f * 4) };
    for (let y = 0; y < finalImg.height; y++) {
      for (let x = 0; x < finalImg.width; x++) {
        const s = (y * finalImg.width + x) * 4;
        for (let dy = 0; dy < f; dy++) {
          for (let dx = 0; dx < f; dx++) {
            const d = (((y * f + dy) * up.width) + (x * f + dx)) * 4;
            up.data[d] = finalImg.data[s];
            up.data[d + 1] = finalImg.data[s + 1];
            up.data[d + 2] = finalImg.data[s + 2];
            up.data[d + 3] = finalImg.data[s + 3];
          }
        }
      }
    }
    finalImg = up;
  }
  const png = new PNG({ width: finalImg.width, height: finalImg.height });
  png.data = Buffer.from(finalImg.data);
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, PNG.sync.write(png));
  return { w: finalImg.width, h: finalImg.height, pitchX: res.pitchX, pitchY: res.pitchY };
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(HELP);
  process.exit(0);
}
const [inDir, outDir] = args.positional;
if (!inDir || !outDir) fail("need <inDir> <outDir> (see --help)", 2);
if (!fs.existsSync(inDir)) fail(`inDir not found: ${inDir}`);
fs.mkdirSync(outDir, { recursive: true });

const pending = new Map();
function schedule(file) {
  if (!file.toLowerCase().endsWith(".png")) return;
  if (pending.has(file)) clearTimeout(pending.get(file));
  pending.set(file, setTimeout(() => {
    pending.delete(file);
    const inPath = path.join(inDir, file);
    const outPath = path.join(outDir, file);
    try {
      const r = snapFile(inPath, outPath, args);
      process.stdout.write(`ok ${file} -> ${outPath} (${r.w}x${r.h} pitch ${r.pitchX}x${r.pitchY})\n`);
    } catch (e) {
      process.stderr.write(`fail ${file}: ${e.message}\n`);
    }
  }, 150));
}

// Initial pass: snap PNGs already present.
for (const f of fs.readdirSync(inDir)) schedule(f);

fs.watch(inDir, (event, file) => {
  if (!file) return;
  try {
    if (!fs.statSync(path.join(inDir, file)).isFile()) return;
  } catch { return; }
  schedule(file);
});
process.stdout.write(`watching ${path.resolve(inDir)} -> ${path.resolve(outDir)} (k=${args.k} dither=${args.dither} pixelSize=${args.pixelSize})\n`);
