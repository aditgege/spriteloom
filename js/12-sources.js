/* =============== frame creation (bake + background removal) =============== */
function perimeterMode(img) {
  const { data, width: w, height: h } = img;
  const counts = new Map();
  const consider = (x, y) => {
    const i = (y * w + x) * 4;
    const k =
      data[i + 3] < 128
        ? "t"
        : (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    counts.set(k, (counts.get(k) || 0) + 1);
  };
  for (let x = 0; x < w; x++) {
    consider(x, 0);
    consider(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    consider(0, y);
    consider(w - 1, y);
  }
  let bk = null,
    bc = 0;
  counts.forEach((c, k) => {
    if (c > bc) {
      bc = c;
      bk = k;
    }
  });
  const color =
    bk !== "t" ? [(bk >> 16) & 255, (bk >> 8) & 255, bk & 255] : null;
  return { key: bk, color };
}
function removeBackground(img, bg) {
  if (bg.key === "t") return; // already transparent
  const { data, width: w, height: h } = img;
  const match = (i) => {
    if (data[i + 3] < 128) return false;
    const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    if (k === bg.key) return true;
    if (bg.color) {
      const dr = data[i] - bg.color[0],
        dg = data[i + 1] - bg.color[1],
        db = data[i + 2] - bg.color[2];
      return dr * dr + dg * dg + db * db < 100;
    }
    return false;
  };
  const visited = new Uint8Array(w * h);
  const stack = [];
  const seed = (x, y) => {
    const p = y * w + x;
    if (!visited[p]) {
      visited[p] = 1;
      if (match(p * 4)) stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x, 0);
    seed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seed(0, y);
    seed(w - 1, y);
  }
  while (stack.length) {
    const p = stack.pop(),
      x = p % w,
      y = Math.floor(p / w);
    data[p * 4 + 3] = 0;
    if (x > 0) seed(x - 1, y);
    if (x < w - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < h - 1) seed(x, y + 1);
  }
}
function alphaBounds(img) {
  const { data, width: w, height: h } = img;
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function createFrame(src, rc) {
  const r = src.result;
  const w = Math.max(1, Math.round(rc.w)),
    h = Math.max(1, Math.round(rc.h));
  const x = Math.max(0, Math.round(rc.x)),
    y = Math.max(0, Math.round(rc.y));
  if (x + w > r.out.width || y + h > r.out.height) return null;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d", { willReadFrequently: true });
  c.drawImage(r.outCanvas, x, y, w, h, 0, 0, w, h); // frames bake their pixels — later re-snaps never corrupt them
  const img = c.getImageData(0, 0, w, h);
  removeBackground(img, perimeterMode(img));
  c.putImageData(img, 0, 0);
  const bounds = alphaBounds(img);
  if (!bounds) return null;
  state.frameCounter[src.id] = (state.frameCounter[src.id] || 0) + 1;
  return {
    id: uid(),
    name: `${src.label}-${String(state.frameCounter[src.id]).padStart(2, "0")}`,
    w,
    h,
    canvas: cv,
    bounds,
    anchor: null,
    zoom: 1,
    ms: 125,
    srcId: src.id,
  };
}
/* frameMs lives hoisted in js/33-clip.js (single global, clamp 10-5000, default 125) */

/* =============== auto-slice (background gap analysis) =============== */
function autoSlice(img) {
  const { data, width: W, height: H } = img;
  const keyAt = (x, y) => {
    const i = (y * W + x) * 4;
    return data[i + 3] < 128
      ? -1
      : (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
  };
  const counts = new Map();
  const bump = (x, y) => {
    const k = keyAt(x, y);
    counts.set(k, (counts.get(k) || 0) + 1);
  };
  for (let x = 0; x < W; x++) {
    bump(x, 0);
    bump(x, H - 1);
  }
  for (let y = 1; y < H - 1; y++) {
    bump(0, y);
    bump(W - 1, y);
  }
  let bg = 0,
    bc = 0;
  counts.forEach((c, k) => {
    if (c > bc) {
      bc = c;
      bg = k;
    }
  });
  const rowEmpty = new Uint8Array(H);
  for (let y = 0; y < H; y++) {
    let e = true;
    for (let x = 0; x < W; x++)
      if (keyAt(x, y) !== bg) {
        e = false;
        break;
      }
    rowEmpty[y] = e ? 1 : 0;
  }
  const rects = [];
  let y = 0;
  while (y < H) {
    while (y < H && rowEmpty[y]) y++;
    if (y >= H) break;
    const y0 = y;
    while (y < H && !rowEmpty[y]) y++;
    const y1 = y;
    const colEmpty = new Uint8Array(W);
    for (let x = 0; x < W; x++) {
      let e = true;
      for (let yy = y0; yy < y1; yy++)
        if (keyAt(x, yy) !== bg) {
          e = false;
          break;
        }
      colEmpty[x] = e ? 1 : 0;
    }
    let x = 0;
    while (x < W) {
      while (x < W && colEmpty[x]) x++;
      if (x >= W) break;
      const x0 = x;
      while (x < W && !colEmpty[x]) x++;
      if (x - x0 >= 2 && y1 - y0 >= 2)
        rects.push({ x: x0, y: y0, w: x - x0, h: y1 - y0 });
    }
  }
  return rects.slice(0, 256);
}
function getAutoslice(src) {
  if (!src.result) return [];
  if (!src.result.autoslice)
    src.result.autoslice = autoSlice(src.result.out);
  return src.result.autoslice;
}
function gridRegions(W, H, cols, rows) {
  const out = [],
    cw = Math.floor(W / cols),
    ch = Math.floor(H / rows);
  if (cw < 1 || ch < 1) return out;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = i * cw,
        y = j * ch;
      out.push({
        x,
        y,
        w: i === cols - 1 ? W - x : cw,
        h: j === rows - 1 ? H - y : ch,
      });
    }
  return out;
}

/* =============== source intake =============== */
function makeThumb(cv) {
  const t = document.createElement("canvas");
  t.width = 120;
  t.height = 72;
  const c = t.getContext("2d");
  const s = Math.min(120 / cv.width, 72 / cv.height);
  c.drawImage(
    cv,
    (120 - cv.width * s) / 2,
    (72 - cv.height * s) / 2,
    cv.width * s,
    cv.height * s,
  );
  return t;
}
function finishSource(rawCanvas, name, label, toastMsg) {
  const w = rawCanvas.width,
    h = rawCanvas.height;
  const rawData = rawCanvas
    .getContext("2d", { willReadFrequently: true })
    .getImageData(0, 0, w, h);
  const src = {
    id: uid(),
    name,
    label:
      label || name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6) || "img",
    raw: rawCanvas,
    rawData,
    thumb: makeThumb(rawCanvas),
    params: {
      k: 12,
      auto: true,
      snap: true,
      pitchX: 8,
      pitchY: 8,
      offX: 0,
      offY: 0,
    },
    result: null,
  };
  state.sources.push(src);
  runSnap(src);
  state.selSrc = src.id;
  renderRail();
  updateCounts();
  syncSnapUI();
  toast(toastMsg || `${name} · ${w}×${h}`);
  if (state.mode === "snap" || state.mode === "frames") renderWorkspace();
}
function addSourceFromImage(img, name) {
  const w0 = img.naturalWidth || img.width,
    h0 = img.naturalHeight || img.height;
  const s = Math.min(1, 2048 / Math.max(w0, h0));
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(w0 * s));
  cv.height = Math.max(1, Math.round(h0 * s));
  cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
  finishSource(cv, name);
}
async function addFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith("image/"));
  if (!files.length) return toast("No image files found", "warn");
  for (const f of files) {
    const url = URL.createObjectURL(f);
    try {
      const img = await loadImage(url);
      addSourceFromImage(img, f.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      toast(`Could not read ${f.name}`, "err");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
function removeSource(id) {
  const i = state.sources.findIndex((s) => s.id === id);
  if (i < 0) return;
  state.sources.splice(i, 1);
  if (state.selSrc === id)
    state.selSrc = state.sources.length
      ? state.sources[Math.max(0, i - 1)].id
      : null;
  if (!state.sources.length) {
    state.mode = "snap";
    updateStepper();
  }
  renderRail();
  updateCounts();
  updateInspector();
  renderWorkspace();
  syncSnapUI();
  toast("Source removed — frames already extracted are kept");
}
function selectSource(id) {
  if (state.selSrc === id) return;
  state.selSrc = id;
  const s = curSrc();
  if (s && !s.result) runSnap(s);
  renderRail();
  syncSnapUI();
  if (state.mode === "snap" || state.mode === "frames") renderWorkspace();
}

/* =============== demo art (procedural, then deliberately "AI-messed") =============== */
function paintSlime(put, ox, oy, o) {
  const { w, h, base, blink } = o;
  const cx = 8;
  const inside = (x, y) => {
    if (y > base) return false;
    const dx = (x + 0.5 - cx) / (w / 2),
      dy = (base - y + 0.5) / h;
    return dx * dx + dy * dy <= 1;
  };
  const OUT = [22, 44, 28],
    BODY = [98, 206, 98],
    HI = [178, 244, 178],
    EW = [244, 244, 230],
    PU = [24, 28, 24];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (!inside(x, y)) continue;
      const edge =
        !inside(x - 1, y) ||
        !inside(x + 1, y) ||
        !inside(x, y - 1) ||
        !inside(x, y + 1);
      put(ox + x, oy + y, edge ? OUT : BODY);
    }
  const hx = Math.round(cx - w * 0.25),
    hy = Math.round(base - h * 0.65);
  put(ox + hx, oy + hy, HI);
  put(ox + hx + 1, oy + hy, HI);
  const ey = Math.round(base - h * 0.5);
  const e1 = Math.round(cx - w * 0.28),
    e2 = Math.round(cx + w * 0.12);
  for (const ex of [e1, e2]) {
    if (blink) {
      put(ox + ex, oy + ey, PU);
      put(ox + ex + 1, oy + ey, PU);
    } else {
      put(ox + ex, oy + ey, EW);
      put(ox + ex, oy + ey + 1, EW);
      put(ox + ex + 1, oy + ey, EW);
      put(ox + ex + 1, oy + ey + 1, PU);
    }
  }
}
function paintCoin(put, ox, oy, rx) {
  const GOLD = [242, 196, 88],
    RIM = [164, 110, 36],
    SHINE = [255, 242, 190],
    SLOT = [196, 146, 58];
  const inside = (x, y) => {
    const dx = (x + 0.5 - 8) / rx,
      dy = (y + 0.5 - 8) / 5.5;
    return dx * dx + dy * dy <= 1;
  };
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (!inside(x, y)) continue;
      const edge =
        !inside(x - 1, y) ||
        !inside(x + 1, y) ||
        !inside(x, y - 1) ||
        !inside(x, y + 1);
      put(ox + x, oy + y, edge ? RIM : GOLD);
    }
  if (rx > 2.5)
    for (let dy = 6; dy <= 8; dy++) {
      put(ox + 7, oy + dy, SLOT);
      put(ox + 8, oy + dy, SLOT);
    }
  else {
    put(ox + 7, oy + 7, SLOT);
    put(ox + 8, oy + 7, SLOT);
  }
  const shx = Math.round(8 - rx * 0.55);
  put(ox + shx, oy + 4, SHINE);
  put(ox + shx + 1, oy + 4, SHINE);
  put(ox + shx, oy + 5, SHINE);
}
function paintHeart(put, ox, oy) {
  const RED = [226, 87, 87],
    DARK = [139, 36, 49],
    SH = [255, 176, 176];
  const inside = (x, y) => {
    const d1 = (x + 0.5 - 5.5) ** 2 + (y + 0.5 - 5.5) ** 2,
      d2 = (x + 0.5 - 10.5) ** 2 + (y + 0.5 - 5.5) ** 2;
    if (d1 <= 9.6 || d2 <= 9.6) return true;
    if (y >= 7 && y <= 12) {
      const hw = 4.4 - (y - 7) * 0.75;
      return Math.abs(x + 0.5 - 8) <= hw;
    }
    return false;
  };
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (!inside(x, y)) continue;
      const edge =
        !inside(x - 1, y) ||
        !inside(x + 1, y) ||
        !inside(x, y - 1) ||
        !inside(x, y + 1);
      put(ox + x, oy + y, edge ? DARK : RED);
    }
  put(ox + 5, oy + 4, SH);
  put(ox + 6, oy + 4, SH);
}
function messyUpscale(src, S) {
  // simulates AI output: per-rect jitter, colour noise, stray artifacts
  const W = src.width * S,
    H = src.height * S;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const octx = out.getContext("2d");
  const id = src
    .getContext("2d")
    .getImageData(0, 0, src.width, src.height);
  const rng = mulberry32(20240613);
  octx.fillStyle = "rgb(43,58,72)";
  octx.fillRect(0, 0, W, H);
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const i = (y * src.width + x) * 4;
      const b = Math.round((rng() - 0.5) * 18);
      octx.fillStyle = `rgb(${clamp255(id.data[i] + b)},${clamp255(id.data[i + 1] + b)},${clamp255(id.data[i + 2] + b)})`;
      const jx = Math.round((rng() - 0.5) * 2.4),
        jy = Math.round((rng() - 0.5) * 2.4);
      octx.fillRect(x * S + jx, y * S + jy, S, S);
    }
  for (let k = 0; k < 14; k++) {
    octx.fillStyle = `hsl(${Math.floor(rng() * 360)},70%,60%)`;
    octx.fillRect(
      Math.floor(rng() * W),
      Math.floor(rng() * H),
      2 + Math.floor(rng() * 3),
      2 + Math.floor(rng() * 3),
    );
  }
  return out;
}
function makeDemo() {
  const logical = document.createElement("canvas");
  logical.width = 64;
  logical.height = 32;
  const L = logical.getContext("2d");
  L.fillStyle = "rgb(43,58,72)";
  L.fillRect(0, 0, 64, 32);
  const put = (x, y, c) => {
    L.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    L.fillRect(x, y, 1, 1);
  };
  paintSlime(put, 0, 0, { w: 11, h: 9, base: 15 });
  paintSlime(put, 16, 0, { w: 13, h: 7, base: 15 });
  paintSlime(put, 32, 0, { w: 9, h: 12, base: 13 });
  paintSlime(put, 48, 0, { w: 11, h: 9, base: 15, blink: true });
  paintCoin(put, 0, 16, 5.5);
  paintCoin(put, 16, 16, 3);
  paintCoin(put, 32, 16, 1.3);
  paintHeart(put, 48, 16);
  finishSource(
    messyUpscale(logical, 8),
    "ai-sprite-batch",
    "ai",
    "Demo batch loaded — drag the divider to see the recovered grid",
  );
}

/* =============== hero =============== */
const HERO_FRAMES = [
  { w: 11, h: 9, base: 15 },
  { w: 13, h: 7, base: 15 },
  { w: 9, h: 12, base: 13 },
  { w: 11, h: 9, base: 15, blink: true },
];
const heroBufs = HERO_FRAMES.map((o) => {
  const cv = document.createElement("canvas");
  cv.width = 16;
  cv.height = 16;
  const c = cv.getContext("2d");
  c.fillStyle = "rgb(43,58,72)";
  c.fillRect(0, 0, 16, 16);
  const put = (x, y, col) => {
    c.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    c.fillRect(x, y, 1, 1);
  };
  paintSlime(put, 0, 0, o);
  return { cv, b: colorBounds(cv, 43, 58, 72) };
});
function colorBounds(cv, r, g, b) {
  const d = cv
    .getContext("2d")
    .getImageData(0, 0, cv.width, cv.height).data;
  const w = cv.width,
    h = cv.height;
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i] !== r || d[i + 1] !== g || d[i + 2] !== b) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  return x1 < 0
    ? { x: 0, y: 0, w, h }
    : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function heroStep(dt) {
  heroAcc += dt;
  if (heroAcc > 170) {
    heroAcc = 0;
    heroFrame = (heroFrame + 1) % heroBufs.length;
  }
  const cv = $("#heroCanvas"),
    ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, 224, 224);
  ctx.fillStyle = "#101010";
  ctx.fillRect(0, 0, 224, 224);
  ctx.strokeStyle = "rgba(255,176,46,.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(30, 206.5);
  ctx.lineTo(194, 206.5);
  ctx.stroke();
  const hb = heroBufs[heroFrame],
    b = hb.b,
    s = 6;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    hb.cv,
    b.x,
    b.y,
    b.w,
    b.h,
    Math.round(112 - (b.w * s) / 2),
    Math.round(206 - b.h * s),
    b.w * s,
    b.h * s,
  );
  ctx.strokeStyle = "#ffb02e";
  ctx.beginPath();
  ctx.moveTo(106, 206);
  ctx.lineTo(118, 206);
  ctx.moveTo(112, 200);
  ctx.lineTo(112, 212);
  ctx.stroke();
  heroBufs.forEach((_, i) => {
    ctx.fillStyle = i === heroFrame ? "#ffb02e" : "#5c5348";
    ctx.fillRect(
      112 - ((heroBufs.length - 1) * 7) / 2 + i * 7 - 1.5,
      216.5,
      3,
      3,
    );
  });
}

/* =============== source-level background key =============== */
/* Frames bake from the snapped result, but background removal must use the
   SOURCE perimeter colour — a tightly cropped auto-slice rect has sprite
   outline pixels on its own perimeter, and would otherwise eat its outline. */
function sourceBgKey(src) {
  if (!src.result.bg) {
    const img = src.result.out;
    const { data, width: w, height: h } = img;
    const counts = new Map();
    const bump = (x, y) => {
      const i = (y * w + x) * 4;
      const k =
        data[i + 3] < 128
          ? "t"
          : (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      counts.set(k, (counts.get(k) || 0) + 1);
    };
    for (let x = 0; x < w; x++) {
      bump(x, 0);
      bump(x, h - 1);
    }
    for (let y = 1; y < h - 1; y++) {
      bump(0, y);
      bump(w - 1, y);
    }
    let bk = null,
      bc = 0;
    counts.forEach((c, k) => {
      if (c > bc) {
        bc = c;
        bk = k;
      }
    });
    const total = 2 * w + 2 * h - 4;
    const color =
      bk !== "t" && bc >= total * 0.4
        ? [(bk >> 16) & 255, (bk >> 8) & 255, bk & 255]
        : null;
    src.result.bg = { key: bk, color };
  }
  return src.result.bg;
}
