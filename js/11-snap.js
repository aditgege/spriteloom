/* =============== 2 · 1D edge-gradient profiles =============== */
function profiles(q) {
  const { labels, cd, w, h, K } = q,
    S = K + 1;
  const gx = new Float64Array(Math.max(0, w - 1));
  for (let x = 0; x < w - 1; x++) {
    let s = 0;
    for (let y = 0; y < h; y++) {
      const o = y * w + x;
      s += cd[labels[o] * S + labels[o + 1]];
    }
    gx[x] = s / h;
  }
  const gy = new Float64Array(Math.max(0, h - 1));
  for (let y = 0; y < h - 1; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) {
      const o = y * w + x;
      s += cd[labels[o] * S + labels[o + w]];
    }
    gy[y] = s / w;
  }
  return { gx, gy };
}
function findPeaks(v) {
  const n = v.length;
  if (n < 5) return [];
  let mean = 0;
  for (let i = 0; i < n; i++) mean += v[i];
  mean /= n;
  let sd = 0;
  for (let i = 0; i < n; i++) sd += (v[i] - mean) ** 2;
  sd = Math.sqrt(sd / n);
  let mx = 0;
  for (let i = 0; i < n; i++) mx = Math.max(mx, v[i]);
  const thr = Math.max(mean + 0.6 * sd, mx * 0.12, 1e-9);
  const pk = [];
  for (let i = 1; i < n - 1; i++)
    if (v[i] >= v[i - 1] && v[i] > v[i + 1] && v[i] >= thr) pk.push(i);
  const out = []; // merge peaks closer than 2, keep the stronger
  for (const p of pk) {
    const last = out[out.length - 1];
    if (last !== undefined && p - last <= 2) {
      if (v[p] > v[last]) out[out.length - 1] = p;
    } else out.push(p);
  }
  return out;
}

/* =============== 3 · pitch + phase estimation =============== */
/* Autocorrelation of the gradient profile (upgraded median-gap heuristic:
multi-cell color runs make median spacing overestimate the pitch). */
function estimatePitch(prof, peaks) {
  const n = prof.length,
    res = { pitch: 0, cands: [] };
  const maxLag = Math.min(72, Math.floor(n / 3));
  if (maxLag < 2) return res;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += prof[i];
  mean /= n;
  const g = new Float64Array(n);
  let r0 = 0;
  for (let i = 0; i < n; i++) {
    g[i] = prof[i] - mean;
    r0 += g[i] * g[i];
  }
  if (r0 < 1e-9) return res;
  const R = new Float64Array(maxLag + 1);
  for (let lag = 2; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += g[i] * g[i + lag];
    R[lag] = s / r0;
  }
  let maxR = 0;
  for (let lag = 2; lag <= maxLag; lag++) maxR = Math.max(maxR, R[lag]);
  const lmax = [];
  for (let lag = 2; lag <= maxLag; lag++) {
    const prev = R[lag - 1],
      nxt = lag < maxLag ? R[lag + 1] : -1;
    if (
      R[lag] >= prev &&
      R[lag] >= nxt &&
      R[lag] > 0.08 &&
      R[lag] > 0.25 * maxR
    )
      lmax.push({ lag, r: R[lag] });
  }
  if (lmax.length) {
    let pitch = 0;
    for (const m of lmax)
      if (m.r >= 0.55 * maxR) {
        pitch = m.lag;
        break;
      } // fundamental = first strong maximum
    if (!pitch) pitch = [...lmax].sort((a, b) => b.r - a.r)[0].lag;
    res.pitch = pitch;
    res.cands = [...lmax]
      .sort((a, b) => b.r - a.r)
      .slice(0, 4)
      .map((m) => m.lag);
    if (!res.cands.includes(pitch)) res.cands.unshift(pitch);
  } else if (peaks.length >= 4) {
    const gaps = [];
    for (let i = 1; i < peaks.length; i++)
      gaps.push(peaks[i] - peaks[i - 1]);
    gaps.sort((a, b) => a - b);
    const med = gaps[gaps.length >> 1];
    if (med >= 2 && med <= 72) {
      res.pitch = med;
      res.cands = [med];
    }
  }
  return res;
}
function estimateOffset(peaks, p) {
  if (!peaks.length || p < 2) return 0;
  const hist = new Float64Array(p);
  for (const pk of peaks) {
    const c = (pk + 1) % p; // a peak at x is a cut boundary at x+1
    hist[c] += 1;
    hist[(c + 1) % p] += 0.5;
    hist[(c + p - 1) % p] += 0.5;
  }
  let best = 0,
    bv = -1;
  for (let i = 0; i < p; i++)
    if (hist[i] > bv) {
      bv = hist[i];
      best = i;
    }
  return best;
}

/* =============== 4 · cut walk, snapped to peaks =============== */
function snapTo(ideal, cand, radius) {
  let best = -1,
    bd = Infinity;
  for (const c of cand) {
    const d = Math.abs(c - ideal);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return bd <= radius ? best : null;
}
function walkCuts(len, p, off, cand, snap) {
  const radius = Math.max(1, Math.round(p * 0.35));
  const minCell = Math.max(2, Math.round(p * 0.3));
  const cuts = [0];
  let pos = 0;
  const next = off > 0 && off < len ? off : p;
  if (next >= minCell && next <= len - minCell) {
    const c = snap ? (snapTo(next, cand, radius) ?? next) : next;
    if (c >= minCell && c <= len - minCell) {
      cuts.push(Math.round(c));
      pos = Math.round(c);
    }
  }
  while (true) {
    const ideal = pos + p;
    if (ideal > len - minCell) break;
    let c = snap
      ? (snapTo(ideal, cand, radius) ?? Math.round(ideal))
      : Math.round(ideal);
    if (c <= pos) c = pos + Math.max(1, minCell);
    if (c > len - Math.max(1, Math.floor(minCell / 2))) break;
    cuts.push(c);
    pos = c;
  }
  cuts.push(len);
  let cells = [];
  for (let i = 1; i < cuts.length; i++)
    cells.push([cuts[i - 1], cuts[i]]);
  let merged = true;
  while (merged && cells.length > 1) {
    // absorb sliver cells into their smaller neighbour
    merged = false;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i][1] - cells[i][0] < minCell) {
        if (i === 0) {
          cells[1][0] = cells[0][0];
          cells.shift();
        } else if (i === cells.length - 1) {
          cells[i - 1][1] = cells[i][1];
          cells.pop();
        } else {
          const pw = cells[i - 1][1] - cells[i - 1][0],
            nw = cells[i + 1][1] - cells[i + 1][0];
          if (pw <= nw) cells[i - 1][1] = cells[i][1];
          else cells[i + 1][0] = cells[i][0];
          cells.splice(i, 1);
        }
        merged = true;
        break;
      }
    }
  }
  const outCuts = cells.map((c) => c[0]);
  outCuts.push(cells[cells.length - 1][1]);
  return outCuts;
}
const seq = (len) => {
  const a = [];
  for (let i = 0; i <= len; i++) a.push(i);
  return a;
};

/* ported from spritefusion-pixel-snapper (MIT) — step/cut stabilization only.
   Profiles, autocorrelation pitch, offsets, resample stay native.
   Attribution: resolve/step logic adapted from SpriteFusion src/lib.rs (MIT). */
function resolveSteps(ex, ey, W, H) {
  const px = ex && ex.pitch >= 2 ? ex.pitch : 0;
  const py = ey && ey.pitch >= 2 ? ey.pitch : 0;
  if (px >= 2 && py >= 2) {
    const lo = Math.min(px, py),
      hi = Math.max(px, py);
    if (hi / lo > 1.8) return { stepX: lo, stepY: lo, fallback: false };
    const avg = Math.max(2, Math.round((px + py) / 2));
    return { stepX: avg, stepY: avg, fallback: false };
  }
  if (px >= 2) return { stepX: px, stepY: px, fallback: false };
  if (py >= 2) return { stepX: py, stepY: py, fallback: false };
  const f = Math.max(1, Math.round(Math.min(W, H) / 64));
  return { stepX: f, stepY: f, fallback: true };
}
function sanitizeCuts(cuts, limit) {
  if (!cuts || !cuts.length) return [0, limit];
  const seen = new Set(),
    out = [];
  for (const c of cuts) {
    let v = Math.round(c);
    if (v < 0) v = 0;
    if (v > limit) v = limit;
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  out.sort((a, b) => a - b);
  if (out[0] !== 0) out.unshift(0);
  if (out[out.length - 1] !== limit) out.push(limit);
  return out;
}
function snapUniformCuts(profile, limit, targetStep, minRequired, candArg, offArg, snapArg) {
  const step = clamp(Math.round(targetStep) || 1, 1, 512);
  let cand = Array.isArray(candArg) ? candArg : null;
  let off = typeof offArg === "number" ? offArg : 0;
  let snap = typeof snapArg === "boolean" ? snapArg : true;
  if (!cand) {
    if (profile && !Array.isArray(profile) && !(profile instanceof Float64Array) && Array.isArray(profile.cand))
      cand = profile.cand;
    else if (Array.isArray(profile)) cand = profile;
    else cand = [];
  }
  if (profile && typeof profile === "object" && !Array.isArray(profile) && !(profile instanceof Float64Array)) {
    if (candArg === undefined && typeof profile.off === "number") off = profile.off;
    if (snapArg === undefined && typeof profile.snap === "boolean") snap = profile.snap;
  }
  if (profile instanceof Float64Array && (!cand || !cand.length))
    cand = findPeaks(profile).map((p) => p + 1);
  void minRequired;
  return sanitizeCuts(walkCuts(limit, step, off, cand || [], snap), limit);
}
function stabilizeCuts(cuts, len, step, sibStep, ctx) {
  ctx = ctx || {};
  const cand = ctx.cand || [],
    off = ctx.off || 0,
    snap = ctx.snap !== false;
  const skewOk = (cc) => {
    if (cc.length < 4) return false;
    let mn = Infinity,
      mx = 0;
    for (let i = 1; i < cc.length; i++) {
      const wd = cc[i] - cc[i - 1];
      if (wd <= 0) return false;
      if (wd < mn) mn = wd;
      if (wd > mx) mx = wd;
    }
    if (!(mn > 0)) return false;
    return mx / mn <= 1.8;
  };
  const cur = sanitizeCuts(cuts, len);
  if (cur.length >= 4 && skewOk(cur)) return { cuts: cur, fallback: false };
  const st = clamp(Math.round(step) || 1, 1, 512);
  const uni = sanitizeCuts(walkCuts(len, st, off, cand, snap), len);
  if (uni.length >= 4 && skewOk(uni)) return { cuts: uni, fallback: false };
  const sib = clamp(Math.round(sibStep) || 0, 1, 512);
  if (sib >= 1 && sib !== st) {
    const s2 = sanitizeCuts(walkCuts(len, sib, off, cand, snap), len);
    if (s2.length >= 4 && skewOk(s2)) return { cuts: s2, fallback: true };
    if (s2.length >= 4) return { cuts: s2, fallback: true };
  }
  const last = snapUniformCuts({ cand, off, snap }, len, st, 4);
  if (last.length >= 4) return { cuts: last, fallback: true };
  return { cuts: cur.length ? cur : [0, len], fallback: true };
}
function stabilizeBothAxes(cutsX, cutsY, W, H, stepX, stepY, ctxX, ctxY) {
  const sx = stabilizeCuts(cutsX, W, stepX, stepY, ctxX);
  const sy = stabilizeCuts(cutsY, H, stepY, stepX, ctxY);
  return { cutsX: sx.cuts, cutsY: sy.cuts, fallback: sx.fallback || sy.fallback };
}

/* =============== 5 · majority resample =============== */
function resample(q, cellsX, cellsY, mode) {
  const W = cellsX.length - 1,
    H = cellsY.length - 1;
  const out = new ImageData(W, H);
  const { labels, cent, K, w } = q;
  const counts = new Uint32Array(K + 1);
  for (let j = 0; j < H; j++) {
    const y0 = cellsY[j],
      y1 = cellsY[j + 1];
    for (let i = 0; i < W; i++) {
      const x0 = cellsX[i],
        x1 = cellsX[i + 1];
      let m = 0;
      if (mode === "center") {
        const cx = x0 + ((x1 - x0) >> 1),
          cy = y0 + ((y1 - y0) >> 1);
        m = labels[cy * w + cx];
      } else if (x1 - x0 === 1 && y1 - y0 === 1) {
        m = labels[y0 * w + x0];
      } else {
        counts.fill(0);
        for (let y = y0; y < y1; y++) {
          const row = y * w;
          for (let x = x0; x < x1; x++) counts[labels[row + x]]++;
        }
        let mv = 0;
        for (let t = 0; t <= K; t++)
          if (counts[t] > mv) {
            mv = counts[t];
            m = t;
          }
      }
      const o = (j * W + i) * 4;
      if (m === K) out.data[o + 3] = 0;
      else {
        out.data[o] = cent[m * 3];
        out.data[o + 1] = cent[m * 3 + 1];
        out.data[o + 2] = cent[m * 3 + 2];
        out.data[o + 3] = 255;
      }
    }
  }
  return out;
}

/* =============== the snap pipeline =============== */
function runSnap(src) {
  const P = src.params;
  const rng = mulberry32(
    0x9e3779b9 ^
      (src.rawData.width * 31 + src.rawData.height * 17 + P.k * 7),
  );
  const q = quantizeImageData(src.rawData, P.k, rng); // 1. quantize
  const prof = profiles(q); // 2. gradients
  const pkX = findPeaks(prof.gx),
    pkY = findPeaks(prof.gy);
  let pitchX = 0,
    pitchY = 0,
    offX = 0,
    offY = 0,
    candsX = [],
    candsY = [];
  if (P.auto) {
    // 3. pitch + phase
    const ex = estimatePitch(prof.gx, pkX),
      ey = estimatePitch(prof.gy, pkY);
    pitchX = ex.pitch;
    pitchY = ey.pitch;
    candsX = ex.cands;
    candsY = ey.cands;
    offX = pitchX >= 2 ? estimateOffset(pkX, pitchX) : 0;
    offY = pitchY >= 2 ? estimateOffset(pkY, pitchY) : 0;
    if (pitchX >= 2) {
      P.pitchX = pitchX;
      P.offX = offX;
    } // seed the manual inputs
    if (pitchY >= 2) {
      P.pitchY = pitchY;
      P.offY = offY;
    }
  } else {
    pitchX = clamp(Math.round(P.pitchX) || 1, 1, 512);
    pitchY = clamp(Math.round(P.pitchY) || 1, 1, 512);
    offX = ((Math.round(P.offX) % pitchX) + pitchX) % pitchX;
    offY = ((Math.round(P.offY) % pitchY) + pitchY) % pitchY;
  }
  const W = src.rawData.width,
    H = src.rawData.height;
  const candX = pkX.map((p) => p + 1),
    candY = pkY.map((p) => p + 1);
  let cellsX, cellsY, pitchFallback = false;
  if (P.auto) {
    // stabilization between pitch estimation and cut walk
    const rs = resolveSteps({ pitch: pitchX }, { pitch: pitchY }, W, H);
    pitchFallback = !!rs.fallback;
    const sx = clamp(Math.round(rs.stepX) || 1, 1, 512);
    const sy = clamp(Math.round(rs.stepY) || 1, 1, 512);
    if (sx >= 2) pitchX = sx;
    if (sy >= 2) pitchY = sy;
    const rawX = sx < 2 ? seq(W) : walkCuts(W, sx, offX, candX, P.snap); // 4. snapped cuts
    const rawY = sy < 2 ? seq(H) : walkCuts(H, sy, offY, candY, P.snap);
    const st = stabilizeBothAxes(rawX, rawY, W, H, sx, sy, { cand: candX, off: offX, snap: P.snap }, { cand: candY, off: offY, snap: P.snap });
    cellsX = st.cutsX;
    cellsY = st.cutsY;
    pitchFallback = pitchFallback || st.fallback;
  } else {
    cellsX =
      pitchX < 2 ? seq(W) : walkCuts(W, pitchX, offX, candX, P.snap); // 4. snapped cuts
    cellsY =
      pitchY < 2 ? seq(H) : walkCuts(H, pitchY, offY, candY, P.snap);
  }
  if (typeof P.dither === "undefined") P.dither = false;
  if (typeof P.palette === "undefined") P.palette = null;
  let out = resample(q, cellsX, cellsY, P.dither ? "center" : "majority"); // 5. majority per cell
  /* Custom palette AFTER resample — nearest-color remap adapted from
     SpriteFusion apply_palette (MIT, SpriteFusion src/lib.rs). */
  if (P.palette) {
    const pal =
      typeof P.palette === "string" ? parsePaletteHex(P.palette) : P.palette;
    if (pal && pal.length) out = applyCustomPalette(out, pal);
  }
  const outCanvas = document.createElement("canvas");
  outCanvas.width = out.width;
  outCanvas.height = out.height;
  outCanvas.getContext("2d").putImageData(out, 0, 0);
  src.result = {
    q,
    cellsX,
    cellsY,
    out,
    outCanvas,
    pitchX,
    pitchY,
    offX,
    offY,
    candsX,
    candsY,
    pitchFallback,
  };
}
      function skipSnapCurrent() {
        const src = curSrc();
        if (!src || !src.rawData) return toast("No source selected", "warn");
        const W = src.rawData.width, H = src.rawData.height;
        const out = src.rawData;
        const outCanvas = document.createElement("canvas");
        outCanvas.width = W; outCanvas.height = H;
        outCanvas.getContext("2d").putImageData(out, 0, 0);
        src.result = {
          q: null,
          cellsX: seq(W),
          cellsY: seq(H),
          out,
          outCanvas,
          pitchX: 0,
          pitchY: 0,
          offX: 0,
          offY: 0,
          candsX: [],
          candsY: [],
          pitchFallback: false,
          skipped: true,
        };
        syncSnapUI();
        if (state.mode === "snap") renderSnapView();
        if (state.mode === "frames") renderFramesView();
        toast("Snap skipped — original used");
      }
function rerunSnap() {
  const src = curSrc();
  if (!src) return;
  runSnap(src);
  syncSnapUI();
  if (state.mode === "snap") renderSnapView();
  if (state.mode === "frames") renderFramesView();
}

/* =============== 01 · snap view (split compare) =============== */
let snapFlip = false,
  sheetZ = 1,
  hoverCell = null,
  marqMoved = false;
function renderSnapView() {
  const src = curSrc();
  if (!src || !src.result) return;
  const R = src.result;
  const rw = src.rawData.width,
    rh = src.rawData.height;
  const stage = $("#splitStage");
  const fit = Math.min(
    (stage.clientWidth - 64) / rw,
    (stage.clientHeight - 64) / rh,
  );
  const s = clamp(fit, 0.02, 8);
  const bw = Math.max(40, Math.round(rw * s)),
    bh = Math.max(40, Math.round(rh * s));
  const box = $("#splitBox");
  box.style.width = bw + "px";
  box.style.height = bh + "px";
  const rawC = $("#rawCanvas");
  rawC.width = rw;
  rawC.height = rh;
  rawC.style.imageRendering = "pixelated";
  rawC.getContext("2d").drawImage(src.raw, 0, 0);
  const snapC = $("#snapCanvas");
  snapC.width = R.out.width;
  snapC.height = R.out.height;
  snapC.getContext("2d").drawImage(R.outCanvas, 0, 0);
  drawSplit();
  syncSnapUI();
}
function setSplitTags() {
  const src = curSrc();
  if (!src || !src.result) return;
  const R = src.result,
    dims = `${R.out.width}×${R.out.height}`;
  if (snapFlip) {
    $(".tag-l").textContent = `SNAPPED · ${dims}`;
    $(".tag-r").textContent = "SOURCE";
  } else {
    $(".tag-l").textContent = "SOURCE";
    $(".tag-r").textContent = `SNAPPED · ${dims}`;
  }
}
function drawSplit() {
  const src = curSrc();
  if (!src || !src.result) return;
  const R = src.result;
  const box = $("#splitBox"),
    bw = box.clientWidth,
    bh = box.clientHeight;
  if (!bw) return;
  const sp = clamp(state.split, 3, 97);
  const rawC = $("#rawCanvas"),
    snapC = $("#snapCanvas"),
    grid = $("#snapGrid");
  if (snapFlip) {
    rawC.style.clipPath = `inset(0 0 0 ${sp}%)`;
    const cl = `inset(0 ${100 - sp}% 0 0)`;
    snapC.style.clipPath = cl;
    grid.style.clipPath = cl;
  } else {
    rawC.style.clipPath = `inset(0 ${100 - sp}% 0 0)`;
    const cl = `inset(0 0 0 ${sp}%)`;
    snapC.style.clipPath = cl;
    grid.style.clipPath = cl;
  }
  grid.width = bw;
  grid.height = bh;
  const g = grid.getContext("2d");
  g.clearRect(0, 0, bw, bh);
  if (R.cellsX.length <= 200 && R.cellsY.length <= 200) {
    g.strokeStyle = "rgba(255,176,46,.5)";
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < R.cellsX.length - 1; i++) {
      const x = Math.round((R.cellsX[i] / R.out.width) * bw) + 0.5;
      g.moveTo(x, 0);
      g.lineTo(x, bh);
    }
    for (let j = 1; j < R.cellsY.length - 1; j++) {
      const y = Math.round((R.cellsY[j] / R.out.height) * bh) + 0.5;
      g.moveTo(0, y);
      g.lineTo(bw, y);
    }
    g.stroke();
  }
  $("#splitHandle").style.left = sp + "%";
  setSplitTags();
}
function syncSnapUI() {
  const src = curSrc();
  const R = src && src.result;
  const read = $("#snapRead");
  if (!R) {
    read.textContent = "—";
    read.classList.remove("bad");
    return;
  }
  const ok = R.pitchX >= 2 || R.pitchY >= 2;
  read.textContent = ok
    ? `${src.rawData.width}×${src.rawData.height} → ${R.out.width}×${R.out.height} · pitch ${R.pitchX}×${R.pitchY}`
    : `no repeating pitch found — pass-through ${R.out.width}×${R.out.height}`;
  if (R.pitchFallback && src.params.auto)
    read.textContent += " · fallback grid (synthesized step)";
  read.classList.toggle("bad", !ok);
  $("#snapWarn").style.display =
    (src.params.auto && !ok) || (src.params.auto && R.pitchFallback) ? "block" : "none";
  fillChips($("#pitchCandsX"), R.candsX, R.pitchX);
  fillChips($("#pitchCandsY"), R.candsY, R.pitchY);
  $("#snapManual").style.display = src.params.auto ? "none" : "grid";
  $("#mPitchX").value = src.params.pitchX;
  $("#mPitchY").value = src.params.pitchY;
  $("#mOffX").value = src.params.offX;
  $("#mOffY").value = src.params.offY;
  $("#snapEdges").checked = src.params.snap;
  $("#kRange").value = src.params.k;
  $("#kVal").textContent = src.params.k;
  const sw = $("#palSwatches");
  sw.innerHTML = "";
  if (R.q)
    for (let k = 0; k < R.q.K; k++) {
      const i = el("i");
      i.style.background = `rgb(${R.q.cent[k * 3]},${R.q.cent[k * 3 + 1]},${R.q.cent[k * 3 + 2]})`;
      sw.appendChild(i);
    }
  $("#snapBarRead").textContent =
    `${src.rawData.width}×${src.rawData.height} → ${R.out.width}×${R.out.height} · ${R.cellsX.length - 1}×${R.cellsY.length - 1} cells`;
}
function fillChips(cont, cands, cur) {
  cont.innerHTML = "";
  const cs = (cands || []).filter((v) => v >= 2).slice(0, 4);
  if (!cs.length) {
    cont.appendChild(el("span", null, "—"));
    return;
  }
  cs.forEach((v) => {
    const c = el("button", "chip" + (v === cur ? " cur" : ""), String(v));
    c.type = "button";
    cont.appendChild(c);
  });
}
function segSelect(seg, btn) {
  [...seg.querySelectorAll("button")].forEach((b) =>
    b.classList.toggle("on", b === btn),
  );
}
function pitchChip(axis, cont) {
  cont.addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    const src = curSrc();
    if (!src || !src.result) return;
    const v = num(c.textContent, 0);
    if (v < 2) return;
    const R = src.result;
    src.params.auto = false;
    if (axis === "x") {
      src.params.pitchX = v;
      src.params.offX = R.offX;
      if (R.pitchY >= 2) {
        src.params.pitchY = R.pitchY;
        src.params.offY = R.offY;
      }
    } else {
      src.params.pitchY = v;
      src.params.offY = R.offY;
      if (R.pitchX >= 2) {
        src.params.pitchX = R.pitchX;
        src.params.offX = R.offX;
      }
    }
    segSelect($("#snapModeSeg"), $('#snapModeSeg [data-v="manual"]'));
    syncSnapUI();
    rerunSnap();
    toast(`Pitch ${axis.toUpperCase()} locked to ${v}px`);
  });
}
pitchChip("x", $("#pitchCandsX"));
pitchChip("y", $("#pitchCandsY"));
const rerunSnapD = debounce(rerunSnap, 140);

/* =============== pixel-size lock (one-click, no DOM) =============== */
function lockPixelSize(src) {
  if (!src || !src.result) return false;
  const R = src.result;
  if (R.pitchX >= 2) {
    src.params.pitchX = R.pitchX;
    src.params.offX = R.offX;
  }
  if (R.pitchY >= 2) {
    src.params.pitchY = R.pitchY;
    src.params.offY = R.offY;
  }
  src.params.auto = false;
  return true;
}
