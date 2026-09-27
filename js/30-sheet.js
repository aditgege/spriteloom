      /* =============== 03 · sheet layout + anchoring =============== */
      function frameAnchor(f) {
        if (f.anchor === "custom")
          return {
            ax: clamp(f.pax ?? 0.5, 0, 1),
            ay: clamp(f.pay ?? 0.5, 0, 1),
          };
        return ANCHORS[f.anchor || state.sheet.anchor] || ANCHORS.bc;
      }
      function computeSheet() {
        const S = state.sheet;
        if (S.packer !== "grid" && S.packer !== "maxrects") S.packer = "grid";
        if (S.bleed !== 0 && S.bleed !== 1) S.bleed = S.bleed ? 1 : 0;
        const packer = S.packer === "maxrects" ? "maxrects" : "grid";
        const bleed = S.bleed ? 1 : 0;
        const fr = state.frames;
        const cols = clamp(num(S.cols, 4), 1, 64);
        const rows = Math.max(1, Math.ceil(fr.length / cols));
        const contents = fr.map((f) => {
          const b = S.trim ? { ...f.bounds } : { x: 0, y: 0, w: f.w, h: f.h };
          return { f, b, cw: b.w * f.zoom, ch: b.h * f.zoom };
        });
        let cellW = 1,
          cellH = 1;
        if (S.autoCell) {
          for (const c of contents) {
            cellW = Math.max(cellW, c.cw);
            cellH = Math.max(cellH, c.ch);
          }
        } else {
          cellW = clamp(num(S.cellW, 16), 1, 512);
          cellH = clamp(num(S.cellH, 16), 1, 512);
        }
        const margin = clamp(num(S.margin, 0), 0, 64),
          sp = clamp(num(S.spacing, 0), 0, 64);
        const sc = clamp(S.scale, 1, 8);
        if (packer === "maxrects") {
          const order = contents.map((c, i) => i).sort((a, b) => contents[b].ch - contents[a].ch);
          const maxUnits = Math.max(1, Math.floor(4096 / sc) - margin * 2);
          let x = margin, y = margin, rowH = 0, maxX = margin, rowCount = 1;
          const placed = new Array(contents.length);
          for (const idx of order) {
            const c = contents[idx];
            const pw = Math.max(1, Math.round(c.cw + bleed * 2));
            const ph = Math.max(1, Math.round(c.ch + bleed * 2));
            if (x + pw > margin + maxUnits && rowH > 0) {
              x = margin;
              y = y + rowH + sp;
              rowH = 0;
              rowCount++;
            }
            placed[idx] = { px: x, py: y, pw, ph };
            x = x + pw + sp;
            if (x - sp > maxX) maxX = x - sp;
            if (ph > rowH) rowH = ph;
          }
          const totalH = contents.length ? y + rowH + margin : margin * 2 + 1;
          const W = Math.max(1, Math.round(maxX * sc));
          const H = Math.max(1, Math.round(totalH * sc));
          const layout = contents.map((c, i) => {
            const p = placed[i] || { px: margin, py: margin };
            const ox = clamp(Math.round(c.f.ox || 0), -64, 64) * sc,
              oy = clamp(Math.round(c.f.oy || 0), -64, 64) * sc;
            return {
              col: 0,
              row: 0,
              dx: Math.round((p.px + bleed) * sc + ox),
              dy: Math.round((p.py + bleed) * sc + oy),
              dw: Math.round(c.cw * sc),
              dh: Math.round(c.ch * sc),
            };
          });
          return {
            cols,
            rows: rowCount,
            cellW,
            cellH,
            margin,
            spacing: sp,
            layout,
            contents,
            W,
            H,
            scale: sc,
            clamped: false,
            packer,
            bleed,
          };
        }
        const W = Math.max(
          1,
          Math.round((margin * 2 + cols * cellW + (cols - 1) * sp) * sc),
        );
        const H = Math.max(
          1,
          Math.round((margin * 2 + rows * cellH + (rows - 1) * sp) * sc),
        );
        const SA = ANCHORS[S.anchor] || ANCHORS.bc;
        const layout = contents.map((c, i) => {
          const col = i % cols,
            row = Math.floor(i / cols);
          const cx = margin + col * (cellW + sp),
            cy = margin + row * (cellH + sp);
          const FA = frameAnchor(c.f);
          const tx = (cx + cellW * SA.ax) * sc,
            ty = (cy + cellH * SA.ay) * sc;
          const px = c.cw * FA.ax * sc,
            py = c.ch * FA.ay * sc;
          const ox = clamp(Math.round(c.f.ox || 0), -64, 64) * sc,
            oy = clamp(Math.round(c.f.oy || 0), -64, 64) * sc;
          return {
            col,
            row,
            dx: Math.round(tx - px + ox),
            dy: Math.round(ty - py + oy),
            dw: Math.round(c.cw * sc),
            dh: Math.round(c.ch * sc),
          };
        });
        return {
          cols,
          rows,
          cellW,
          cellH,
          margin,
          spacing: sp,
          layout,
          contents,
          W,
          H,
          scale: sc,
          clamped: false,
          packer,
          bleed,
        };
      }
      function clampSheetCache(sh) {
        const MAX = 4096;
        if (sh.W <= MAX && sh.H <= MAX) {
          sh.clamped = false;
          return sh;
        }
        const origW = sh.W,
          origH = sh.H;
        const k = Math.min(MAX / origW, MAX / origH);
        sh.origW = origW;
        sh.origH = origH;
        sh.scale = sh.scale * k;
        sh.W = Math.max(1, Math.floor(origW * k));
        sh.H = Math.max(1, Math.floor(origH * k));
        for (const L of sh.layout) {
          L.dx = Math.round(L.dx * k);
          L.dy = Math.round(L.dy * k);
          L.dw = Math.max(1, Math.round(L.dw * k));
          L.dh = Math.max(1, Math.round(L.dh * k));
        }
        sh.clamped = true;
        return sh;
      }
      function computeSheetSize() {
        const sh = computeSheet();
        const clamped = sh.W > 4096 || sh.H > 4096;
        return { W: sh.W, H: sh.H, cols: sh.cols, rows: sh.rows, clamped };
      }
      function sheetWarning() {
        if (!sheetCache || !sheetCache.clamped) return "";
        const ow = sheetCache.origW || sheetCache.W,
          oh = sheetCache.origH || sheetCache.H;
        return `Sheet ${ow}×${oh} clamped to 4096 — reduce frames/scale`;
      }
      function applySheetPreset(name) {
        const S = state.sheet;
        if (name === "16px-4x4") {
          S.cols = 4;
          S.autoCell = false;
          S.cellW = 16;
          S.cellH = 16;
          S.scale = 1;
        } else if (name === "32px-8x4") {
          S.cols = 8;
          S.autoCell = false;
          S.cellW = 32;
          S.cellH = 32;
          S.scale = 1;
        } else if (name === "64px-4x2") {
          S.cols = 4;
          S.autoCell = false;
          S.cellW = 64;
          S.cellH = 64;
          S.scale = 1;
        } else {
          return;
        }
        invalidateSheet();
      }
      function invalidateSheet() {
        sheetCache = null;
        playerDirty = true;
        if (state.mode === "sheet") renderSheetView();
      }
      function setPacker(name) {
        state.sheet.packer = name === "maxrects" ? "maxrects" : "grid";
        invalidateSheet();
      }
      function setBleed(v) {
        state.sheet.bleed = v ? 1 : 0;
        invalidateSheet();
      }
      function renderSheetView() {
        const empty = state.frames.length === 0;
        $("#sheetEmptyMsg").style.display = empty ? "grid" : "none";
        $("#sheetBody").style.display = empty ? "none" : "flex";
        if (empty) {
          $("#sheetRead").textContent = "no frames yet";
          $("#sheetBarRead").textContent = "—";
          sheetCache = null;
          return;
        }
        sheetCache = computeSheet();
        clampSheetCache(sheetCache);
        const sh = sheetCache;
        const cv = $("#sheetCanvas");
        cv.width = sh.W;
        cv.height = sh.H;
        const ctx = cv.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, sh.W, sh.H);
        state.frames.forEach((f, i) => {
          const L = sh.layout[i],
            b = sh.contents[i].b;
          ctx.drawImage(f.canvas, b.x, b.y, b.w, b.h, L.dx, L.dy, L.dw, L.dh);
          if (sh.bleed === 1 && b.w > 0 && b.h > 0) {
            const bx = Math.max(1, Math.round(sh.scale));
            const by = Math.max(1, Math.round(sh.scale));
            ctx.drawImage(f.canvas, b.x, b.y, 1, b.h, L.dx - bx, L.dy, bx, L.dh);
            ctx.drawImage(f.canvas, b.x + b.w - 1, b.y, 1, b.h, L.dx + L.dw, L.dy, bx, L.dh);
            ctx.drawImage(f.canvas, b.x, b.y, b.w, 1, L.dx, L.dy - by, L.dw, by);
            ctx.drawImage(f.canvas, b.x, b.y + b.h - 1, b.w, 1, L.dx, L.dy + L.dh, L.dw, by);
            ctx.drawImage(f.canvas, b.x, b.y, 1, 1, L.dx - bx, L.dy - by, bx, by);
            ctx.drawImage(f.canvas, b.x + b.w - 1, b.y, 1, 1, L.dx + L.dw, L.dy - by, bx, by);
            ctx.drawImage(f.canvas, b.x, b.y + b.h - 1, 1, 1, L.dx - bx, L.dy + L.dh, bx, by);
            ctx.drawImage(f.canvas, b.x + b.w - 1, b.y + b.h - 1, 1, 1, L.dx + L.dw, L.dy + L.dh, bx, by);
          }
        });
        const stage = $("#sheetScroll");
        const fit = Math.min(
          (stage.clientWidth - 56) / sh.W,
          (stage.clientHeight - 56) / sh.H,
        );
        const z =
          state.sheetZoom === 0 ? clamp(fit, 0.02, 12) : state.sheetZoom;
        sheetZ = z;
        const dw = Math.max(40, Math.round(sh.W * z)),
          dh = Math.max(40, Math.round(sh.H * z));
        const wrap = $("#sheetWrap");
        wrap.style.width = dw + "px";
        wrap.style.height = dh + "px";
        const ov = $("#sheetOverlay");
        ov.width = dw;
        ov.height = dh;
        $("#sheetBarRead").textContent =
          `${sh.cols}×${sh.rows} GRID · CELL ${sh.cellW}×${sh.cellH} · ${sh.W}×${sh.H} PX`;
        $("#sheetRead").textContent =
          `${sh.W} × ${sh.H} px · ${state.frames.length} frames · ${ANCHOR_LABELS[state.sheet.anchor]} · ×${sh.scale}`;
        $("#rowsRead").value = `${sh.rows} (auto)`;
        sheetHoverI = -1;
        drawSheetOverlay();
        playerDirty = true;
      }
      function drawSheetOverlay() {
        const ov = $("#sheetOverlay"),
          ctx = ov.getContext("2d");
        ctx.clearRect(0, 0, ov.width, ov.height);
        if (!sheetCache || !state.frames.length) return;
        const sh = sheetCache;
        const z = ov.width / sh.W || 1;
        const sc = sh.scale,
          sp = sh.spacing;
        const cellX = (c) => (sh.margin + c * (sh.cellW + sp)) * sc * z;
        const cellY = (r) => (sh.margin + r * (sh.cellH + sp)) * sc * z;
        const cw = sh.cellW * sc * z,
          ch = sh.cellH * sc * z;
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(164,154,140,.35)";
        ctx.beginPath();
        for (let c = 0; c <= sh.cols; c++) {
          const x = Math.round(cellX(c)) + 0.5;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, ov.height);
        }
        for (let r = 0; r <= sh.rows; r++) {
          const y = Math.round(cellY(r)) + 0.5;
          ctx.moveTo(0, y);
          ctx.lineTo(ov.width, y);
        }
        ctx.stroke();
        if (sheetHoverI >= 0 && sheetHoverI < state.frames.length) {
          const L = sh.layout[sheetHoverI];
          ctx.fillStyle = "rgba(255,176,46,.15)";
          ctx.fillRect(L.dx * z, L.dy * z, L.dw * z, L.dh * z);
          ctx.strokeStyle = "rgba(255,176,46,.55)";
          ctx.strokeRect(
            Math.round(cellX(L.col)) + 0.5,
            Math.round(cellY(L.row)) + 0.5,
            Math.round(cw) - 1,
            Math.round(ch) - 1,
          );
        }
        if (state.selFrame != null) {
          const i = state.frames.findIndex((f) => f.id === state.selFrame);
          if (i >= 0) {
            const L = sh.layout[i];
            ctx.strokeStyle = "#ffc65e";
            ctx.lineWidth = 2;
            ctx.strokeRect(
              L.dx * z + 0.5,
              L.dy * z + 0.5,
              L.dw * z - 1,
              L.dh * z - 1,
            );
            ctx.lineWidth = 1;
          }
        }
        // anchors LAST so they are always visible above sprites/selection
        const drawAnchorMark = (x, y, big, sel) => {
          const r = big ? 5 : 4;
          ctx.lineWidth = big ? 2 : 1.5;
          ctx.strokeStyle = "rgba(0,0,0,.85)";
          ctx.beginPath();
          ctx.moveTo(x - r - 1.5, y + 0.5);
          ctx.lineTo(x + r + 1.5, y + 0.5);
          ctx.moveTo(x + 0.5, y - r - 1.5);
          ctx.lineTo(x + 0.5, y + r + 1.5);
          ctx.stroke();
          ctx.strokeStyle = sel ? "#ffffff" : "#ffb02e";
          ctx.beginPath();
          ctx.moveTo(x - r, y + 0.5);
          ctx.lineTo(x + r, y + 0.5);
          ctx.moveTo(x + 0.5, y - r);
          ctx.lineTo(x + 0.5, y + r);
          ctx.stroke();
          ctx.fillStyle = sel ? "#ffffff" : "#ffb02e";
          ctx.fillRect(x - 1, y - 1, 2, 2);
          ctx.lineWidth = 1;
        };
        const SA2 = ANCHORS[state.sheet.anchor] || ANCHORS.bc;
        for (let r = 0; r < sh.rows; r++)
          for (let c = 0; c < sh.cols; c++) {
            const fi = r * sh.cols + c;
            if (fi >= state.frames.length) continue;
            const sel = state.frames[fi].id === state.selFrame;
            drawAnchorMark(cellX(c) + cw * SA2.ax, cellY(r) + ch * SA2.ay, sel, sel);
          }
      }
      function nudgeFrame(id, dx, dy) {
        const f = state.frames.find((x) => x.id === id);
        if (!f) return false;
        f.ox = clamp(Math.round(f.ox || 0) + dx, -64, 64);
        f.oy = clamp(Math.round(f.oy || 0) + dy, -64, 64);
        invalidateSheet();
        playerDirty = true;
        const ff = selFrameObj();
        if (ff && ff.id === id) drawFa();
        if (state.mode === "align" && typeof renderAlignView === "function") {
          try { renderAlignView(); } catch (e) {}
        }
        if (typeof renderStackPanel === "function") {
          try { renderStackPanel(); } catch (e) {}
        }
        return true;
      }
      function setFrameOffset(id, ox, oy) {
        const f = state.frames.find((x) => x.id === id);
        if (!f) return false;
        f.ox = clamp(Math.round(ox || 0), -64, 64);
        f.oy = clamp(Math.round(oy || 0), -64, 64);
        invalidateSheet();
        playerDirty = true;
        if (state.mode === "align" && typeof renderAlignView === "function") {
          try { renderAlignView(); } catch (e) {}
        }
        return true;
      }
      function resetFrameOffset(id) {
        return setFrameOffset(id, 0, 0);
      }
      function hitSheetFrame(e) {
        if (!sheetCache) return -1;
        const sh = sheetCache;
        const r = $("#sheetOverlay").getBoundingClientRect();
        if (!r.width) return -1;
        const z = r.width / sh.W;
        const x = (e.clientX - r.left) / z,
          y = (e.clientY - r.top) / z;
        for (let i = 0; i < sh.layout.length; i++) {
          const L = sh.layout[i];
          if (x >= L.dx && x < L.dx + L.dw && y >= L.dy && y < L.dy + L.dh)
            return i;
        }
        const sc = sh.scale;
        const col = clamp(
          Math.floor((x / sc - sh.margin) / (sh.cellW + sh.spacing)),
          0,
          sh.cols - 1,
        );
        const row = clamp(
          Math.floor((y / sc - sh.margin) / (sh.cellH + sh.spacing)),
          0,
          sh.rows - 1,
        );
        return row * sh.cols + col;
      }
      const sov = $("#sheetOverlay");
      sov.addEventListener("pointermove", (e) => {
        if (!sheetCache) return;
        const i = hitSheetFrame(e);
        const v = i >= 0 && i < state.frames.length ? i : -1;
        if (v !== sheetHoverI) {
          sheetHoverI = v;
          drawSheetOverlay();
        }
      });
      sov.addEventListener("click", (e) => {
        if (!sheetCache) return;
        const i = hitSheetFrame(e);
        if (i >= 0 && i < state.frames.length) selectFrame(state.frames[i].id);
        else if (state.selFrame != null) {
          state.selFrame = null;
          renderTray();
          updateFrameSec();
          drawSheetOverlay();
        }
      });

      /* =============== runtime player (alignment check) =============== */
      function drawPlayer() {
        const cv = $("#playerCanvas"),
          ctx = cv.getContext("2d");
        ctx.clearRect(0, 0, 200, 130);
        const n = state.frames.length;
        if (n) state.player.i = ((state.player.i % n) + n) % n;
        $("#ppIdx").textContent = n ? `${state.player.i + 1}/${n}` : "0/0";
        if (!n) return;
        const S = state.sheet;
        const SA = ANCHORS[S.anchor];
        const ax = 24 + 152 * SA.ax,
          ay = 16 + 92 * SA.ay;
        ctx.strokeStyle = "rgba(255,176,46,.25)";
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(16, 124.5);
        ctx.lineTo(184, 124.5);
        ctx.stroke();
        ctx.setLineDash([]);
        const drawPlayerAnchor = () => {
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(0,0,0,.85)";
          ctx.beginPath();
          ctx.moveTo(ax - 7, ay + 0.5);
          ctx.lineTo(ax + 7, ay + 0.5);
          ctx.moveTo(ax + 0.5, ay - 7);
          ctx.lineTo(ax + 0.5, ay + 7);
          ctx.stroke();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "#ffb02e";
          ctx.beginPath();
          ctx.moveTo(ax - 6, ay + 0.5);
          ctx.lineTo(ax + 6, ay + 0.5);
          ctx.moveTo(ax + 0.5, ay - 6);
          ctx.lineTo(ax + 0.5, ay + 6);
          ctx.stroke();
          ctx.fillStyle = "#ffb02e";
          ctx.fillRect(ax - 1, ay - 1, 2, 2);
          ctx.lineWidth = 1;
        };
        const infos = state.frames.map((f) => {
          const b = S.trim ? { ...f.bounds } : { x: 0, y: 0, w: f.w, h: f.h };
          return { b, cw: b.w * f.zoom, ch: b.h * f.zoom };
        });
        let mcw = 1,
          mch = 1;
        for (const c of infos) {
          mcw = Math.max(mcw, c.cw);
          mch = Math.max(mch, c.ch);
        }
        const bs = Math.min(152 / mcw, 92 / mch);
        ctx.imageSmoothingEnabled = false;
        const drawAt = (idx, alpha) => {
          const f = state.frames[idx],
            c = infos[idx];
          const FA = frameAnchor(f);
          const s = bs * f.zoom;
          const w = c.cw * s,
            h = c.ch * s;
          ctx.globalAlpha = alpha;
          ctx.drawImage(
            f.canvas,
            c.b.x,
            c.b.y,
            c.b.w,
            c.b.h,
            Math.round(ax - w * FA.ax),
            Math.round(ay - h * FA.ay),
            Math.round(w),
            Math.round(h),
          );
          ctx.globalAlpha = 1;
        };
        if (S.onion && n > 1) drawAt((state.player.i - 1 + n) % n, 0.35);
        drawAt(state.player.i, 1);
        drawPlayerAnchor();
      }
      function stepPlayer(d) {
        const n = state.frames.length;
        if (!n) return;
        state.player.i = (((state.player.i + d) % n) + n) % n;
        playerDirty = true;
      }

      /* =============== per-frame pivot editor =============== */
      function drawFa() {
        const f = selFrameObj();
        if (!f) return;
        const cv = $("#faCanvas"),
          ctx = cv.getContext("2d");
        ctx.clearRect(0, 0, 246, 148);
        ctx.fillStyle = "#151310";
        ctx.fillRect(0, 0, 246, 148);
        const b = state.sheet.trim
          ? { ...f.bounds }
          : { x: 0, y: 0, w: f.w, h: f.h };
        const s = Math.min(206 / b.w, 108 / b.h);
        const dw = Math.max(1, b.w * s),
          dh = Math.max(1, b.h * s);
        const dx = Math.round((246 - dw) / 2),
          dy = Math.round((148 - dh) / 2);
        faDraw = { dx, dy, dw, dh };
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(f.canvas, b.x, b.y, b.w, b.h, dx, dy, dw, dh);
        ctx.fillStyle = "rgba(236,231,221,.28)";
        for (let gy = 0; gy < 3; gy++)
          for (let gx = 0; gx < 3; gx++)
            ctx.fillRect(
              Math.round(dx + (dw * gx) / 2) - 1,
              Math.round(dy + (dh * gy) / 2) - 1,
              2,
              2,
            );
        const FA = frameAnchor(f);
        const mx = dx + dw * FA.ax,
          my = dy + dh * FA.ay;
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,.85)";
        ctx.beginPath();
        ctx.moveTo(mx - 6, my);
        ctx.lineTo(mx + 6, my);
        ctx.moveTo(mx, my - 6);
        ctx.lineTo(mx, my + 6);
        ctx.stroke();
        ctx.strokeStyle = "#ffb02e";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(mx - 5, my);
        ctx.lineTo(mx + 5, my);
        ctx.moveTo(mx, my - 5);
        ctx.lineTo(mx, my + 5);
        ctx.stroke();
        ctx.fillStyle = "#ffb02e";
        ctx.fillRect(mx - 1, my - 1, 2, 2);
        ctx.lineWidth = 1;
        const mode =
          f.anchor === null
            ? `follows sheet (${state.sheet.anchor})`
            : f.anchor;
        const ox = Math.round(f.ox || 0), oy = Math.round(f.oy || 0);
        const fms = clamp(Math.round(f.ms != null ? f.ms : 125), 10, 5000);
        $("#faRead").textContent =
          `PIVOT ${FA.ax.toFixed(2)}·${FA.ay.toFixed(2)} · POS ${ox}·${oy} · ${fms}ms · CONTENT ${b.w}×${b.h} · ${mode}`;
        $("#fzRead").textContent = "×" + f.zoom;
        const fxI = $("#fxOff"), fyI = $("#fyOff");
        if (fxI && document.activeElement !== fxI) fxI.value = ox;
        if (fyI && document.activeElement !== fyI) fyI.value = oy;
        const fdm2 = $("#fdMs");
        if (fdm2 && document.activeElement !== fdm2) fdm2.value = fms;
        const fdp = $("#fdPreset");
        if (fdp && typeof segSelect === "function") {
          const b = fdp.querySelector(`[data-ms="${fms}"]`);
          segSelect(fdp, b || { matches: () => false });
          [...fdp.querySelectorAll("button")].forEach((x) =>
            x.classList.toggle("on", +x.dataset.ms === fms),
          );
        }
      }
      function updateFrameSec() {
        const f = selFrameObj(),
          sec = $("#frameSec");
        if (!f || (state.mode !== "sheet" && state.mode !== "align")) {
          sec.style.display = "none";
          return;
        }
        sec.style.display = "flex";
        $("#fsName").textContent = f.name;
        const inp = $("#fsNameInput");
        if (inp && document.activeElement !== inp) inp.value = f.name;
        const lbl = $("#fsExportLabel");
        if (lbl) lbl.textContent = typeof sanitizeFileName === "function" ? sanitizeFileName(f.name) : f.name;
        drawFa();
        const inp2 = $("#fsNameInput");
        if (inp2 && !inp2._wired) {
          inp2._wired = true;
          inp2.addEventListener("change", () => {
            const ff = selFrameObj();
            if (!ff) return;
            const v = inp2.value.trim();
            if (!v || v === ff.name) { inp2.value = ff.name; return; }
            if (typeof renameFrame === "function") renameFrame(ff.id, v);
            const cur = selFrameObj();
            if (cur) inp2.value = cur.name;
          });
          inp2.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); inp2.blur(); }
            if (e.key === "Escape") { const f2 = selFrameObj(); if (f2) inp2.value = f2.name; inp2.blur(); }
          });
        }
        const btn2 = $("#fsExport");
        if (btn2 && !btn2._wired) {
          btn2._wired = true;
          btn2.addEventListener("click", () => {
            const ff = selFrameObj();
            if (!ff) return toast("Select a frame first", "warn");
            if (typeof exportSingleFrame === "function") exportSingleFrame(ff);
          });
        }
      }
      $("#faCanvas").addEventListener("click", (e) => {
        const f = selFrameObj();
        if (!f || !faDraw) return;
        const r = e.target.getBoundingClientRect();
        const x = (e.clientX - r.left) * (246 / r.width);
        const y = (e.clientY - r.top) * (148 / r.height);
        const fx = clamp((x - faDraw.dx) / faDraw.dw, 0, 1);
        const fy = clamp((y - faDraw.dy) / faDraw.dh, 0, 1);
        f.anchor = "custom";
        f.pax = fx;
        f.pay = fy;
        drawFa();
        invalidateSheet();
        toast(`Pivot set to ${fx.toFixed(2)} · ${fy.toFixed(2)}`);
      });
      $("#faReset").onclick = () => {
        const f = selFrameObj();
        if (!f) return;
        f.anchor = null;
        drawFa();
        invalidateSheet();
        toast("Pivot follows the sheet anchor again");
      };
      $("#fzMinus").onclick = () => {
        const f = selFrameObj();
        if (!f) return;
        f.zoom = clamp(f.zoom - 1, 1, 8);
        drawFa();
        invalidateSheet();
      };
      $("#fzPlus").onclick = () => {
        const f = selFrameObj();
        if (!f) return;
        f.zoom = clamp(f.zoom + 1, 1, 8);
        drawFa();
        invalidateSheet();
      };

