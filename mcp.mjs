#!/usr/bin/env node
// SpriteLoom MCP server — stdio JSON-RPC (no SDK, no browser). Reuses core.mjs + pngjs.
import { PNG } from "pngjs";
import * as core from "./core.mjs";

const TOOL_DEF = {
  name: "pixel_snap",
  description: "Snap an uploaded PNG to its recovered pixel grid (SpriteLoom core.snapImageData).",
  inputSchema: {
    type: "object",
    properties: {
      imageBase64: { type: "string", description: "PNG base64, with or without data: prefix" },
      k: { type: "number", description: "quantization colors 2-24 (default 8)" },
      palette: { type: "string", description: 'custom palette "0d2b45,ffecd6" (# optional)' },
      dither: { type: "boolean", description: "center-sample cells (default false)" },
      pixelSize: { type: "number", description: "nearest-neighbor upscale factor (default 1)" }
    },
    required: ["imageBase64"]
  }
};

function stripPrefix(s) {
  const i = s.indexOf("base64,");
  return i >= 0 ? s.slice(i + 7) : s;
}

function upscaleNearest(img, factor) {
  const f = Math.floor(Number(factor));
  if (!(f > 1)) return img;
  const out = { width: img.width * f, height: img.height * f, data: new Uint8ClampedArray(img.width * f * img.height * f * 4) };
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const s = (y * img.width + x) * 4;
      for (let dy = 0; dy < f; dy++) {
        for (let dx = 0; dx < f; dx++) {
          const d = ((y * f + dy) * out.width + (x * f + dx)) * 4;
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

function doPixelSnap(args) {
  args = args || {};
  if (typeof args.imageBase64 !== "string" || !args.imageBase64.length) {
    throw { code: -32602, message: "pixel_snap needs imageBase64 string" };
  }
  const buf = Buffer.from(stripPrefix(args.imageBase64.trim()), "base64");
  let png;
  try {
    png = PNG.sync.read(buf);
  } catch (e) {
    throw { code: -32602, message: `pngjs cannot decode input: ${e.message}` };
  }
  let k = args.k === undefined ? 8 : Math.round(Number(args.k));
  if (!Number.isFinite(k)) k = 8;
  k = Math.max(2, Math.min(24, k));
  const palette = typeof args.palette === "string" && args.palette.length ? args.palette : null;
  const dither = !!args.dither;
  let pixelSize = args.pixelSize === undefined ? 1 : Math.floor(Number(args.pixelSize));
  if (!Number.isFinite(pixelSize) || pixelSize < 1) pixelSize = 1;
  const img = { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
  const res = core.snapImageData(img, { k, palette, dither });
  const finalImg = upscaleNearest(res.out, pixelSize);
  const enc = new PNG({ width: finalImg.width, height: finalImg.height });
  enc.data = Buffer.from(finalImg.data);
  const outBuf = PNG.sync.write(enc);
  const meta = { pitchX: res.pitchX, pitchY: res.pitchY, w: finalImg.width, h: finalImg.height };
  return { content: [{ type: "text", text: JSON.stringify(meta) }, { type: "image", data: outBuf.toString("base64"), mimeType: "image/png" }] };
}

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function fail(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }) + "\n");
}

function handle(msg) {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || msg.method === undefined) {
    if (msg && msg.id !== undefined) fail(msg.id, -32600, "invalid request");
    return;
  }
  const isNotif = msg.id === undefined || msg.id === null;
  try {
    if (msg.method === "initialize") {
      if (isNotif) return;
      respond(msg.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "spritelloom", version: "0.1.0" } });
    } else if (msg.method === "notifications/initialized") {
      return;
    } else if (msg.method === "tools/list") {
      if (isNotif) return;
      respond(msg.id, { tools: [TOOL_DEF] });
    } else if (msg.method === "tools/call") {
      if (isNotif) return;
      const p = msg.params || {};
      if (p.name !== "pixel_snap") fail(msg.id, -32602, `unknown tool ${p.name}`);
      else {
        try {
          respond(msg.id, doPixelSnap(p.arguments));
        } catch (e) {
          fail(msg.id, e && e.code ? e.code : -32603, e && e.message ? e.message : "tool failed");
        }
      }
    } else {
      if (!isNotif) fail(msg.id, -32601, `method not found: ${msg.method}`);
    }
  } catch (e) {
    if (!isNotif) fail(msg.id, -32603, e && e.message ? e.message : "internal error");
  }
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      handle(JSON.parse(line));
    } catch {
      fail(null, -32700, "parse error");
    }
  }
});
