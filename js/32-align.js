      /* =============== 04 · ALIGN stage =============== */
      /* Big anchor-match workspace. Stack mode composites all visible frames
         on the sheet anchor (active opaque on top, rest tinted ghosts).
         Play mode shows the runtime player large. Classic script. */
      let alignZoom = 0, alignMode = "stack", alignGhostCache = null;
      function alignState() {
        if (typeof stackState === "function") return stackState();
        return { order: state.frames.map((f) => f.id), hidden: [], ghost: 0.45, tint: true, solo: false };
      }
      function alignInfos() {
        const S = state.sheet;
        const list = (typeof stackOrderedFrames === "function")
          ? stackOrderedFrames().filter((f) => !(alignState().hidden || []).includes(f.id))
          : [...state.frames];
        return list.map((f) => {
          const b = S.trim ? { ...f.bounds } : { x: 0, y: 0, w: f.w, h: f.h };
          const ox = clamp(Math.round(f.ox || 0), -64, 64);
          const oy = clamp(Math.round(f.oy || 0), -64, 64);
          return { f, b, cw: b.w * f.zoom, ch: b.h * f.zoom, ox, oy };
        });
      }
      function renderAlignView() {
        const empty = state.frames.length === 0;
        const bar = $("#alignBarRead");
        if (empty) {
          if (bar) bar.textContent = "no frames yet — extract first";
          const cv0 = $("#alignCanvas");
          if (cv0) { cv0.width = 4; cv0.height = 4; }
          const idx = $("#alIdx");
          if (idx) idx.textContent = "0/0";
          return;
        }
        const infos = alignInfos();
        let mcw = 1, mch = 1;
        for (const c of infos) {
          mcw = Math.max(mcw, c.cw);
          mch = Math.max(mch, c.ch);
        }
        const stage = $("#alignScroll");
        const fit = stage ? Math.min(
          (stage.clientWidth - 56) / Math.max(1, mcw),
          (stage.clientHeight - 56) / Math.max(1, mch),
        ) : 4;
        const z = alignZoom === 0 ? clamp(fit, 0.25, 16) : alignZoom;
        const S = state.sheet;
        const SA = ANCHORS[S.anchor] || ANCHORS.bc;
        const pad = 24;
        const W = Math.max(8, Math.round(mcw * z + pad * 2));
        const H = Math.max(8, Math.round(mch * z + pad * 2));
        const cv = $("#alignCanvas");
        cv.width = W;
        cv.height = H;
        const ctx = cv.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, W, H);
        const ax = Math.round(pad + mcw * z * SA.ax);
        const ay = Math.round(pad + mch * z * SA.ay);
        const st = alignState();
        const ghost = typeof st.ghost === "number" ? st.ghost : 0.45;
        const drawOne = (c, alpha, tint) => {
          const FA = (typeof frameAnchor === "function") ? frameAnchor(c.f) : SA;
          const w = c.cw * z, h = c.ch * z;
          const dx = Math.round(ax - w * FA.ax + c.ox * z);
          const dy = Math.round(ay - h * FA.ay + c.oy * z);
          if (tint && st.tint && typeof tintedDraw === "function") {
            const col = (typeof stackColor === "function") ? stackColor(c.f.id) : "#29adff";
            tintedDraw(ctx, c.f, c.b, dx, dy, w, h, col, alpha);
          } else {
            ctx.globalAlpha = alpha;
            ctx.drawImage(c.f.canvas, c.b.x, c.b.y, c.b.w, c.b.h, dx, dy, Math.round(w), Math.round(h));
            ctx.globalAlpha = 1;
          }
        };
        if (alignMode === "play") {
          const n = state.frames.length;
          if (n) state.player.i = ((state.player.i % n) + n) % n;
          const cur = infos.find((c) => c.f.id === state.frames[state.player.i]?.id) || infos[0];
          if (S.onion && n > 1) {
            const prevId = state.frames[(state.player.i - 1 + n) % n]?.id;
            const prv = infos.find((c) => c.f.id === prevId);
            if (prv) drawOne(prv, 0.35, true);
          }
          if (cur) drawOne(cur, 1, false);
          const idx = $("#alIdx");
          if (idx) idx.textContent = n ? `${state.player.i + 1}/${n}` : "0/0";
        } else {
          const activeId = state.selFrame;
          const ordered = (st.solo && activeId != null)
            ? infos.filter((c) => c.f.id === activeId)
            : infos;
          for (const c of ordered) {
            if (c.f.id === activeId) continue;
            drawOne(c, ghost, true);
          }
          const act = ordered.find((c) => c.f.id === activeId) || null;
          if (act) drawOne(act, 1, false);
          else if (ordered.length && activeId == null) {
            // no selection: top of stack opaque
            const top = ordered[ordered.length - 1];
            drawOne(top, 1, false);
          }
          const idx = $("#alIdx");
          if (idx) idx.textContent = `${ordered.length}/${infos.length} shown`;
        }
        // ground line + anchor cross LAST — always visible
        ctx.strokeStyle = "rgba(255,176,46,.25)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(8.5, ay + 0.5);
        ctx.lineTo(W - 8.5, ay + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,.85)";
        ctx.beginPath();
        ctx.moveTo(ax - 8, ay + 0.5);
        ctx.lineTo(ax + 8, ay + 0.5);
        ctx.moveTo(ax + 0.5, ay - 8);
        ctx.lineTo(ax + 0.5, ay + 8);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffb02e";
        ctx.beginPath();
        ctx.moveTo(ax - 6, ay + 0.5);
        ctx.lineTo(ax + 6, ay + 0.5);
        ctx.moveTo(ax + 0.5, ay - 6);
        ctx.lineTo(ax + 0.5, ay + 6);
        ctx.stroke();
        ctx.fillStyle = "#ffb02e";
        ctx.fillRect(ax - 1, ay - 1, 3, 3);
        ctx.lineWidth = 1;
        const wrap = $("#alignWrap");
        if (wrap) {
          const dw = Math.max(40, W), dh = Math.max(40, H);
          wrap.style.width = dw + "px";
          wrap.style.height = dh + "px";
          const inner = $("#alignCanvas");
          if (inner) { inner.style.width = dw + "px"; inner.style.height = dh + "px"; }
        }
        if (bar) {
          const an = (typeof selFrameObj === "function" && selFrameObj()) ? selFrameObj().name : "—";
          let clipTxt = "";
          if (typeof getClipInfo === "function") {
            try {
              const ci = getClipInfo(state.clipName, state.frames);
              if (ci && ci.n) clipTxt = ` · CLIP ${ci.name || "—"} ${ci.totalMs}ms`;
            } catch (e) {}
          }
          bar.textContent = alignMode === "play"
            ? `PLAY · ${W}×${H} · ${ANCHOR_LABELS[S.anchor]}${clipTxt}`
            : `STACK · ACTIVE ${an} · ${W}×${H} · ${ANCHOR_LABELS[S.anchor]}${clipTxt}`;
        }
        if (typeof drawStack === "function") {
          try { drawStack(); } catch (e) {}
        }
      }
      function setAlignMode(v) {
        alignMode = v === "play" ? "play" : "stack";
        const seg = $("#alignModeSeg");
        if (seg && typeof segSelect === "function") {
          const b = seg.querySelector(`[data-v="${alignMode}"]`);
          if (b) segSelect(seg, b);
        }
        renderAlignView();
      }
      function stepAlign(d) {
        const n = state.frames.length;
        if (!n) return;
        state.player.i = (((state.player.i + d) % n) + n) % n;
        const f = state.frames[state.player.i];
        if (f && typeof selectFrame === "function") {
          state.selFrame = f.id;
          if (typeof renderTray === "function") renderTray();
          if (typeof updateFrameSec === "function") updateFrameSec();
          if (typeof drawSheetOverlay === "function") drawSheetOverlay();
        }
        playerDirty = true;
        renderAlignView();
      }
      (function wireAlign() {
        const seg = $("#alignModeSeg");
        if (seg) seg.addEventListener("click", (e) => {
          const b = e.target.closest("button");
          if (!b) return;
          setAlignMode(b.dataset.v);
        });
        const zs = $("#alignZoomSeg");
        if (zs) zs.addEventListener("click", (e) => {
          const b = e.target.closest("button");
          if (!b) return;
          if (typeof segSelect === "function") segSelect(zs, b);
          alignZoom = +b.dataset.z;
          renderAlignView();
        });
        const pv = $("#alPrev");
        if (pv) pv.addEventListener("click", () => stepAlign(-1));
        const nx = $("#alNext");
        if (nx) nx.addEventListener("click", () => stepAlign(1));
        const pl = $("#alPlay");
        if (pl) pl.addEventListener("click", () => {
          state.player.playing = !state.player.playing;
          pl.classList.toggle("on", state.player.playing);
        });
        const on = $("#alOnion");
        if (on) on.addEventListener("click", () => {
          state.sheet.onion = !state.sheet.onion;
          on.classList.toggle("on", state.sheet.onion);
          playerDirty = true;
          renderAlignView();
        });
        const fp = $("#alFps");
        if (fp) fp.addEventListener("input", (e) => {
          state.sheet.fps = clamp(num(e.target.value, 8), 1, 24);
          const v = $("#alFpsV");
          if (v) v.textContent = state.sheet.fps;
          const p2 = $("#ppFps");
          if (p2) p2.value = state.sheet.fps;
          const p2v = $("#ppFpsV");
          if (p2v) p2v.textContent = state.sheet.fps;
        });
        try {
          if (fp) fp.value = state.sheet.fps;
          const v = $("#alFpsV");
          if (v) v.textContent = state.sheet.fps;
        } catch (e) {}
        if (window.lucide && typeof refreshIcons === "function") refreshIcons();
      })();
