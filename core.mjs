/* SpriteLoom core — DOM-free (ES module, file:// + Node safe).
   MIT attribution: palette remap + resolve/step stabilization adapted from
   SpriteFusion src/lib.rs (MIT) and spritefusion-pixel-snapper (MIT).
   See js/10-kmeans.js and js/11-snap.js for browser originals. */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* =============== 1 · K-MEANS quantization =============== */
function kmeansHist(items, K, rng) {
  const M = items.length;
  const col = new Float64Array(M * 3),
    wgt = new Float64Array(M);
  items.forEach((it, i) => {
    col[i * 3] = it.r;
    col[i * 3 + 1] = it.g;
    col[i * 3 + 2] = it.b;
    wgt[i] = it.c;
  });
  const d2 = new Float64Array(M).fill(Infinity);
  const pick = (keys) => {
    let tot = 0;
    for (let i = 0; i < M; i++) tot += keys[i];
    if (tot <= 0) return Math.floor(rng() * M);
    let r = rng() * tot;
    for (let i = 0; i < M; i++) {
      r -= keys[i];
      if (r <= 0) return i;
    }
    return M - 1;
  };
  const cents = [];
  const i0 = pick(wgt);
  cents.push([col[i0 * 3], col[i0 * 3 + 1], col[i0 * 3 + 2]]);
  const tmp = new Float64Array(M);
  for (let k = 1; k < K; k++) {
    const c = cents[k - 1];
    for (let i = 0; i < M; i++) {
      const d =
        (col[i * 3] - c[0]) ** 2 +
        (col[i * 3 + 1] - c[1]) ** 2 +
        (col[i * 3 + 2] - c[2]) ** 2;
      if (d < d2[i]) d2[i] = d;
    }
    for (let i = 0; i < M; i++) tmp[i] = d2[i] * wgt[i];
    const idx = pick(tmp);
    cents.push([col[idx * 3], col[idx * 3 + 1], col[idx * 3 + 2]]);
  }
  const asg = new Int16Array(M).fill(-1);
  for (let iter = 0; iter < 14; iter++) {
    let moved = 0;
    for (let i = 0; i < M; i++) {
      let bi = 0,
        bd = Infinity;
      for (let k = 0; k < K; k++) {
        const c = cents[k];
        const d =
          (col[i * 3] - c[0]) ** 2 +
          (col[i * 3 + 1] - c[1]) ** 2 +
          (col[i * 3 + 2] - c[2]) ** 2;
        if (d < bd) {
          bd = d;
          bi = k;
        }
      }
      if (asg[i] !== bi) {
        asg[i] = bi;
        moved++;
      }
    }
    const sums = new Float64Array(K * 4);
    for (let i = 0; i < M; i++) {
      const k = asg[i];
      sums[k * 4] += col[i * 3] * wgt[i];
      sums[k * 4 + 1] += col[i * 3 + 1] * wgt[i];
      sums[k * 4 + 2] += col[i * 3 + 2] * wgt[i];
      sums[k * 4 + 3] += wgt[i];
    }
    for (let k = 0; k < K; k++)
      if (sums[k * 4 + 3] > 0)
        cents[k] = [
          sums[k * 4] / sums[k * 4 + 3],
          sums[k * 4 + 1] / sums[k * 4 + 3],
          sums[k * 4 + 2] / sums[k * 4 + 3],
        ];
    if (!moved && iter > 0) break;
  }
  return cents.map((c) => [
    Math.round(c[0]),
    Math.round(c[1]),
    Math.round(c[2]),
  ]);
}
function quantizeImageData(img, K, rng) {
  const data = img.data,
    W = img.width,
    H = img.height,
    n = W * H;
  K = Math.max(2, Math.min(24, K));
  let hist = new Map(),
    overflow = false;
  const bump = (i) => {
    const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let e = hist.get(k);
    if (e === undefined) {
      if (hist.size >= 60000) {
        overflow = true;
        return;
      }
      e = { r: data[i], g: data[i + 1], b: data[i + 2], c: 0 };
      hist.set(k, e);
    }
    e.c++;
  };
  for (let i = 0; i < n && !overflow; i++) {
    if (data[i * 4 + 3] >= 128) bump(i * 4);
  }
  if (overflow) {
    // photo-like input: stride-sample the histogram
    hist = new Map();
    const step = Math.max(2, Math.ceil(n / 40000));
    for (let i = 0; i < n; i += step) {
      if (data[i * 4 + 3] >= 128) bump(i * 4);
    }
  }
  const items = [...hist.values()];
  K = Math.min(K, items.length);
  const cents =
    items.length <= K
      ? items.map((it) => [it.r, it.g, it.b])
      : kmeansHist(items, K, rng);
  const labelOf = new Map();
  for (const [k, it] of hist) {
    let bi = 0,
      bd = Infinity;
    for (let c = 0; c < K; c++) {
      const cc = cents[c];
      const d =
        (it.r - cc[0]) ** 2 + (it.g - cc[1]) ** 2 + (it.b - cc[2]) ** 2;
      if (d < bd) {
        bd = d;
        bi = c;
      }
    }
    labelOf.set(k, bi);
  }
  const labels = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] < 128) {
      labels[i] = K;
      continue;
    }
    labels[i] = labelOf.get(
      (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2],
    );
  }
  const cent = new Uint8Array(K * 3);
  cents.forEach((c, k) => {
    cent[k * 3] = c[0];
    cent[k * 3 + 1] = c[1];
    cent[k * 3 + 2] = c[2];
  });
  const S = K + 1,
    cd = new Float64Array(S * S);
  for (let a = 0; a < S; a++)
    for (let b = 0; b < S; b++) {
      if (a === b) continue;
      if (a === K || b === K) {
        cd[a * S + b] = 60000;
        continue;
      }
      const dr = cent[a * 3] - cent[b * 3],
        dg = cent[a * 3 + 1] - cent[b * 3 + 1],
        db = cent[a * 3 + 2] - cent[b * 3 + 2];
      cd[a * S + b] = dr * dr + dg * dg + db * db;
    }
  return { labels, cent, K, w: W, h: H, cd };
}
/* =============== custom palette (SpriteFusion CLI compat) =============== */
/* Palette remap adapted from SpriteFusion apply_palette (MIT) — nearest-color
   mapping of output pixels onto a custom palette. Attribution: SpriteFusion
   src/lib.rs (MIT). Hex format "0d2b45,ffecd6" matches the SpriteFusion CLI. */
function parsePaletteHex(str) {
  const out = [];
  if (typeof str !== "string" || !str.length) return out;
  const parts = str.split(",");
  for (let i = 0; i < parts.length; i++) {
    let s = parts[i].trim().replace(/^#/, "");
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    if (!/^[0-9a-fA-F]{6}$/.test(s)) continue;
    out.push([
      parseInt(s.slice(0, 2), 16),
      parseInt(s.slice(2, 4), 16),
      parseInt(s.slice(4, 6), 16),
    ]);
  }
  return out;
}
function applyCustomPalette(src, palette) {
  const pal = typeof palette === "string" ? parsePaletteHex(palette) : palette;
  if (!pal || !pal.length) return src;
  if (
    src &&
    src.data &&
    typeof src.width === "number" &&
    typeof src.height === "number"
  ) {
    const out = { width: src.width, height: src.height, data: new Uint8ClampedArray(src.width * src.height * 4) };
    const sd = src.data,
      dd = out.data,
      n = src.width * src.height;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      if (sd[o + 3] < 128) {
        dd[o + 3] = 0;
        continue;
      }
      const r = sd[o],
        g = sd[o + 1],
        b = sd[o + 2];
      let bi = 0,
        bd = Infinity;
      for (let k = 0; k < pal.length; k++) {
        const c = pal[k];
        const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
        if (d < bd) {
          bd = d;
          bi = k;
        }
      }
      dd[o] = pal[bi][0];
      dd[o + 1] = pal[bi][1];
      dd[o + 2] = pal[bi][2];
      dd[o + 3] = 255;
    }
    return out;
  }
  if (src && src.labels && src.cent) {
    const K = src.K,
      cent = src.cent;
    for (let k = 0; k < K; k++) {
      const r = cent[k * 3],
        g = cent[k * 3 + 1],
        b = cent[k * 3 + 2];
      let bi = 0,
        bd = Infinity;
      for (let p = 0; p < pal.length; p++) {
        const c = pal[p];
        const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
        if (d < bd) {
          bd = d;
          bi = p;
        }
      }
      cent[k * 3] = pal[bi][0];
      cent[k * 3 + 1] = pal[bi][1];
      cent[k * 3 + 2] = pal[bi][2];
    }
    const S = K + 1,
      cd = src.cd;
    for (let a = 0; a < S; a++)
      for (let b = 0; b < S; b++) {
        if (a === b) continue;
        if (a === K || b === K) {
          cd[a * S + b] = 60000;
          continue;
        }
        const dr = cent[a * 3] - cent[b * 3],
          dg = cent[a * 3 + 1] - cent[b * 3 + 1],
          db = cent[a * 3 + 2] - cent[b * 3 + 2];
        cd[a * S + b] = dr * dr + dg * dg + db * db;
      }
    return src;
  }
  return src;
}
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
/* =============== 5 · majority resample (DOM-free) =============== */
function resample(q, cellsX, cellsY, mode) {
  const W = cellsX.length - 1,
    H = cellsY.length - 1;
  const out = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
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
/* =============== the snap pipeline (DOM-free) =============== */
function snapImageData(imgData, opts) {
  opts = opts || {};
  const P = {
    k: opts.k !== undefined ? opts.k : 8,
    auto: opts.auto !== undefined ? !!opts.auto : true,
    pitchX: opts.pitchX !== undefined ? opts.pitchX : 0,
    pitchY: opts.pitchY !== undefined ? opts.pitchY : 0,
    offX: opts.offX !== undefined ? opts.offX : 0,
    offY: opts.offY !== undefined ? opts.offY : 0,
    snap: opts.snap !== undefined ? !!opts.snap : true,
    dither: opts.dither !== undefined ? !!opts.dither : false,
    palette: opts.palette !== undefined ? opts.palette : null,
  };
  const rng = mulberry32(
    0x9e3779b9 ^
      (imgData.width * 31 + imgData.height * 17 + P.k * 7),
  );
  const q = quantizeImageData(imgData, P.k, rng); // 1. quantize
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
  const W = imgData.width,
    H = imgData.height;
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
  return {
    q,
    cellsX,
    cellsY,
    out,
    pitchX,
    pitchY,
    offX,
    offY,
    candsX,
    candsY,
    pitchFallback,
  };
}
export { mulberry32, clamp, parsePaletteHex, kmeansHist, quantizeImageData, profiles, findPeaks, estimatePitch, estimateOffset, snapTo, walkCuts, seq, resample, resolveSteps, sanitizeCuts, snapUniformCuts, stabilizeCuts, stabilizeBothAxes, snapImageData };
