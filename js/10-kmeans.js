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
    const out = new ImageData(src.width, src.height);
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
