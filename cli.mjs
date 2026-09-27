#!/usr/bin/env node
// SpriteLoom CLI — DOM-free Node wrapper around core.mjs (file:// safe, no canvas).
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import * as core from "./core.mjs";

const HELP = `spritelloom — DOM-free PNG pixel-snap CLI (core.mjs + pngjs)

Usage:
  node cli.mjs <input.png> <output.png> [opts]
  node cli.mjs --job <job.json>
  node cli.mjs --help

Single-file opts:
  --k <n>            quantization colors 2..24 (default 8)
  --palette <hex>    custom palette "0d2b45,ffecd6" (# optional, 3/6-digit)
  --dither           center-sample cells (else majority vote)
  --pixel-size <n>   nearest-neighbor upscale of snapped output (default 1)

Job file (JSON):
  { "inputs": ["in/a.png"], "outDir": "out",
    "k": 12, "palette": "0d2b45,ffecd6", "dither": true, "pixelSize": 8 }

Examples:
  node cli.mjs input.png output.png --k 12 --palette 0d2b45,ffecd6 --dither --pixel-size 8
  node cli.mjs --job job.json
`;

function printHelpAndExit(code = 0) {
  process.stdout.write(HELP);
  process.exit(code);
}

function fail(msg, code = 1) {
  process.stderr.write(`spritelloom: ${msg}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const o = {
    positional: [],
    k: 8,
    palette: null,
    dither: false,
    pixelSize: 1,
    job: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--job") o.job = argv[++i] ?? fail("missing value for --job", 2);
    else if (a === "--k") o.k = Number(argv[++i] ?? fail("missing value for --k", 2));
    else if (a === "--palette") o.palette = argv[++i] ?? fail("missing value for --palette", 2);
    else if (a === "--dither") o.dither = true;
    else if (a === "--no-dither") o.dither = false;
    else if (a === "--pixel-size" || a === "--pixelSize") {
      o.pixelSize = Number(argv[++i] ?? fail("missing value for --pixel-size", 2));
    } else if (a.startsWith("--pixel-size=")) o.pixelSize = Number(a.split("=")[1]);
    else if (a.startsWith("--k=")) o.k = Number(a.split("=")[1]);
    else if (a.startsWith("--palette=")) o.palette = a.split("=").slice(1).join("=");
    else if (a.startsWith("--job=")) o.job = a.split("=").slice(1).join("=");
    else if (a.startsWith("-")) fail(`unknown flag ${a} (see --help)`, 2);
    else o.positional.push(a);
  }
  return o;
}

function loadImageData(inPath) {
  let buf;
  try {
    buf = fs.readFileSync(inPath);
  } catch (e) {
    fail(`cannot read input "${inPath}": ${e.message}`);
  }
  let png;
  try {
    png = PNG.sync.read(buf);
  } catch (e) {
    fail(`pngjs cannot decode "${inPath}": ${e.message}`);
  }
  // Store as ImageData-like RGBA 8-bit for core.snapImageData.
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}

function upscaleNearest(img, factor) {
  const f = Math.floor(factor);
  if (!(f > 1)) return img;
  const out = { width: img.width * f, height: img.height * f, data: new Uint8ClampedArray(img.width * f * img.height * f * 4) };
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const s = (y * img.width + x) * 4;
      for (let dy = 0; dy < f; dy++) {
        for (let dx = 0; dx < f; dx++) {
          const d = (((y * f + dy) * out.width) + (x * f + dx)) * 4;
          out.data[d] = img.data[s];
          out.data[d + 1] = img.data[s + 1];
          out.data[d + 2] = img.data[s + 2];
          out.data[d + 3] = img.data[s + 3];
        }
      }
    }
  }
  return out;
}

function saveImageData(img, outPath) {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  let encoded;
  try {
    encoded = PNG.sync.write(png);
  } catch (e) {
    fail(`pngjs cannot encode "${outPath}": ${e.message}`);
  }
  try {
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(outPath, encoded);
  } catch (e) {
    fail(`cannot write output "${outPath}": ${e.message}`);
  }
}

function toCoreOpts(o) {
  const k = Number(o.k);
  const pixelSize = Number(o.pixelSize ?? o.pixel_size ?? 1);
  return {
    k: Number.isFinite(k) ? Math.max(2, Math.min(24, Math.round(k))) : 8,
    palette: typeof o.palette === "string" && o.palette.length ? o.palette : null,
    dither: !!o.dither,
    pixelSize: Number.isFinite(pixelSize) && pixelSize > 1 ? Math.floor(pixelSize) : 1,
  };
}

function snapFile(inPath, outPath, opts) {
  const img = loadImageData(inPath);
  const co = toCoreOpts(opts);
  const res = core.snapImageData(img, { k: co.k, palette: co.palette, dither: co.dither });
  const finalImg = upscaleNearest(res.out, co.pixelSize);
  saveImageData(finalImg, outPath);
  return { inPath, outPath, w: finalImg.width, h: finalImg.height, pitchX: res.pitchX, pitchY: res.pitchY };
}

function runJob(jobPath) {
  let job;
  try {
    job = JSON.parse(fs.readFileSync(jobPath, "utf8"));
  } catch (e) {
    fail(`cannot read job file "${jobPath}": ${e.message}`);
  }
  const inputs = job.inputs;
  const outDir = job.outDir || job.outdir || job.out_dir;
  if (!Array.isArray(inputs) || !inputs.length) fail(`job "${jobPath}" needs non-empty "inputs" array`, 2);
  if (!outDir) fail(`job "${jobPath}" needs "outDir" string`, 2);
  const base = toCoreOpts({
    k: job.k ?? 8,
    palette: job.palette ?? null,
    dither: job.dither ?? false,
    pixelSize: job.pixelSize ?? job.pixel_size ?? job.pixelize ?? 1,
  });
  let failed = 0;
  for (const inp of inputs) {
    const outPath = path.join(outDir, path.basename(inp, path.extname(inp)) + ".png");
    try {
      const r = snapFile(inp, outPath, base);
      process.stdout.write(`ok ${r.inPath} -> ${r.outPath} (${r.w}x${r.h} pitch ${r.pitchX}x${r.pitchY})\n`);
    } catch (e) {
      failed++;
      process.stderr.write(`fail ${inp}: ${e.message}\n`);
    }
  }
  if (failed) process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) printHelpAndExit(0);
if (args.job) {
  if (args.positional.length) fail("positional args not allowed with --job", 2);
  runJob(args.job);
} else {
  const [input, output] = args.positional;
  if (!input || !output) fail("need <input.png> <output.png> or --job job.json (see --help)", 2);
  const r = snapFile(input, output, args);
  process.stdout.write(`ok ${r.inPath} -> ${r.outPath} (${r.w}x${r.h} pitch ${r.pitchX}x${r.pitchY})\n`);
}
