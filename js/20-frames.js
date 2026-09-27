      /* =============== 02 · frames view =============== */
      function renderFramesView() {
        const src = curSrc();
        if (!src || !src.result) return;
        const R = src.result,
          ow = R.out.width,
          oh = R.out.height;
        const stage = $("#framesScroll");
        const fit = Math.min(
          (stage.clientWidth - 56) / ow,
          (stage.clientHeight - 56) / oh,
        );
        const z =
          state.framesZoom === 0 ? Math.max(fit, 0.02) : state.framesZoom;
        framesZ = z;
        const dw = Math.max(40, Math.round(ow * z)),
          dh = Math.max(40, Math.round(oh * z));
        const wrap = $("#framesWrap");
        wrap.style.width = dw + "px";
        wrap.style.height = dh + "px";
        const cv = $("#framesCanvas");
        cv.width = ow;
        cv.height = oh;
        cv.getContext("2d").drawImage(R.outCanvas, 0, 0);
        const ov = $("#framesOverlay");
        ov.width = dw;
        ov.height = dh;
        hoverRect = null;
        hoverCell = null;
        drawFramesOverlay();
        updAutoRead();
        updateFramesBar();
      }
      function updateFramesBar() {
        const src = curSrc();
        if (!src || !src.result) return;
        let extra = "";
        if (state.frameMode === "auto")
          extra = ` · ${getAutoslice(src).length} regions`;
        $("#framesBarRead").textContent =
          `${src.result.out.width}×${src.result.out.height}${extra} · ×${framesZ < 1 ? framesZ.toFixed(2) : framesZ}`;
      }
      function updAutoRead() {
        const src = curSrc();
        if (!src || !src.result) {
          $("#autoRead").textContent = "—";
          $("#autoAddBtn").disabled = true;
          return;
        }
        const regs = getAutoslice(src);
        if (!regs.length) {
          $("#autoRead").textContent =
            "No separated sprites found — the canvas reads as one block. Try Grid or Marquee.";
          $("#autoAddBtn").disabled = true;
        } else {
          let mw = 0,
            mh = 0;
          for (const r of regs) {
            mw += r.w;
            mh += r.h;
          }
          $("#autoRead").textContent =
            `${regs.length} regions · avg ${Math.round(mw / regs.length)}×${Math.round(mh / regs.length)} — add them all, or click them on the canvas.`;
          $("#autoAddBtn").disabled = false;
        }
      }
      function drawFramesOverlay() {
        const src = curSrc();
        if (!src || !src.result) return;
        const R = src.result,
          z = framesZ;
        const ov = $("#framesOverlay"),
          ctx = ov.getContext("2d");
        ctx.clearRect(0, 0, ov.width, ov.height);
        ctx.lineWidth = 1;
        if (state.frameMode === "auto") {
          for (const r of getAutoslice(src)) {
            const hot = r === hoverRect;
            const x = r.x * z,
              y = r.y * z,
              w = r.w * z,
              h = r.h * z;
            ctx.strokeStyle = hot ? "#ffb02e" : "rgba(236,231,221,.5)";
            ctx.strokeRect(
              x + 0.5,
              y + 0.5,
              Math.max(1, w - 1),
              Math.max(1, h - 1),
            );
            if (hot) {
              ctx.fillStyle = "rgba(255,176,46,.18)";
              ctx.fillRect(x, y, w, h);
            }
          }
        } else if (state.frameMode === "grid") {
          const cols = clamp(num($("#gridCols").value, 4), 1, 64),
            rows = clamp(num($("#gridRows").value, 4), 1, 64);
          ctx.strokeStyle = "rgba(236,231,221,.45)";
          ctx.beginPath();
          for (let i = 1; i < cols; i++) {
            const x = Math.round(((i * R.out.width) / cols) * z) + 0.5;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, ov.height);
          }
          for (let j = 1; j < rows; j++) {
            const y = Math.round(((j * R.out.height) / rows) * z) + 0.5;
            ctx.moveTo(0, y);
            ctx.lineTo(ov.width, y);
          }
          ctx.stroke();
          if (hoverCell) {
            const cw = R.out.width / cols,
              ch = R.out.height / rows;
            const x = hoverCell.c * cw * z,
              y = hoverCell.r * ch * z;
            ctx.fillStyle = "rgba(255,176,46,.18)";
            ctx.fillRect(x, y, cw * z, ch * z);
            ctx.strokeStyle = "#ffb02e";
            ctx.strokeRect(x + 0.5, y + 0.5, cw * z - 1, ch * z - 1);
          }
        } else if (state.marquee) {
          const m = state.marquee;
          if (typeof marqDrag !== "undefined" && marqDrag && marqDrag.raw) {
            const q = marqDrag.raw;
            const qx = q.x * z,
              qy = q.y * z,
              qw = q.w * z,
              qh = q.h * z;
            ctx.strokeStyle = "rgba(255,255,255,.9)";
            ctx.lineWidth = 1;
            ctx.strokeRect(
              qx + 0.5,
              qy + 0.5,
              Math.max(1, qw - 1),
              Math.max(1, qh - 1),
            );
          }
          const x = m.x * z,
            y = m.y * z,
            w = m.w * z,
            h = m.h * z;
          ctx.fillStyle = "rgba(255,176,46,.2)";
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = "#ffb02e";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(
            x + 0.5,
            y + 0.5,
            Math.max(1, w - 1),
            Math.max(1, h - 1),
          );
          ctx.lineWidth = 1;
          ctx.fillStyle = "#ffb02e";
          ctx.font = "600 10px JetBrains Mono,monospace";
          ctx.fillText(`${m.w}×${m.h}`, x + 3, y - 4 < 8 ? y + 13 : y - 4);
        }
      }
      function snapEdge(v, cells) {
        // snap a marquee edge to a recovered cut if it's close
        let best = Math.round(v),
          bd = Infinity;
        for (const c of cells) {
          const d = Math.abs(c - v);
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
        return bd * framesZ < 4 ? best : Math.round(v);
      }
      function positionMarqueeBtn() {
        const m = state.marquee;
        if (!m) return;
        const wrap = $("#framesWrap");
        const x = clamp(
          m.x * framesZ + m.w * framesZ - 6,
          8,
          Math.max(8, wrap.clientWidth - 100),
        );
        const y = clamp(
          m.y * framesZ + m.h * framesZ - 40,
          4,
          Math.max(4, wrap.clientHeight - 34),
        );
        const btn = $("#marqueeAdd");
        btn.style.display = "block";
        btn.style.left = x + "px";
        btn.style.top = y + "px";
        $("#maSize").textContent = `${m.w}×${m.h}`;
      }
      function addFrames(list, label) {
        const ok = list.filter(Boolean);
        if (!ok.length) return toast("Nothing to extract there", "warn");
        pushUndo();
        state.frames.push(...ok);
        state.marquee = null;
        marqMoved = false;
        $("#marqueeAdd").style.display = "none";
        $("#marqAddBtn").disabled = true;
        renderTray();
        updateCounts();
        invalidateSheet();
        if (state.mode === "frames") drawFramesOverlay();
        toast(
          `${ok.length} frame${ok.length > 1 ? "s" : ""} added${label ? " · " + label : ""}`,
        );
      }
      function addMarquee() {
        const src = curSrc();
        if (!src || !state.marquee) return;
        addFrames([createFrame(src, state.marquee)]);
      }

      /* frames canvas interactions */
      const fov = $("#framesOverlay");
      fov.addEventListener("pointerdown", (e) => {
        if (state.frameMode !== "marquee" || e.button !== 0) return;
        const src = curSrc();
        if (!src || !src.result) return;
        const r = fov.getBoundingClientRect();
        const sx = (e.clientX - r.left) / framesZ,
          sy = (e.clientY - r.top) / framesZ;
        marqDrag = {
          x0: snapEdge(sx, src.result.cellsX),
          y0: snapEdge(sy, src.result.cellsY),
          rx0: sx,
          ry0: sy,
          raw: null,
        };
        marqMoved = false;
        state.marquee = null;
        $("#marqueeAdd").style.display = "none";
        fov.setPointerCapture(e.pointerId);
      });
      fov.addEventListener("pointermove", (e) => {
        const src = curSrc();
        if (!src || !src.result) return;
        const R = src.result;
        const r = fov.getBoundingClientRect();
        const sx = (e.clientX - r.left) / framesZ,
          sy = (e.clientY - r.top) / framesZ;
        if (state.frameMode === "auto") {
          const hit =
            getAutoslice(src).find(
              (g) => sx >= g.x && sx < g.x + g.w && sy >= g.y && sy < g.y + g.h,
            ) || null;
          if (hit !== hoverRect) {
            hoverRect = hit;
            drawFramesOverlay();
          }
        } else if (state.frameMode === "grid") {
          const cols = clamp(num($("#gridCols").value, 4), 1, 64),
            rows = clamp(num($("#gridRows").value, 4), 1, 64);
          const c = Math.floor(sx / (R.out.width / cols)),
            rr = Math.floor(sy / (R.out.height / rows));
          const hc =
            c >= 0 && c < cols && rr >= 0 && rr < rows ? { c, r: rr } : null;
          if (JSON.stringify(hc) !== JSON.stringify(hoverCell)) {
            hoverCell = hc;
            drawFramesOverlay();
          }
        } else if (marqDrag) {
          marqMoved = true;
          const R2 = src.result;
          const cx0 = clamp(marqDrag.rx0, 0, R2.out.width);
          const cy0 = clamp(marqDrag.ry0, 0, R2.out.height);
          const cx1 = clamp(Math.round(sx), 0, R2.out.width);
          const cy1 = clamp(Math.round(sy), 0, R2.out.height);
          marqDrag.raw = {
            x: Math.round(Math.min(cx0, cx1)),
            y: Math.round(Math.min(cy0, cy1)),
            w: Math.round(Math.abs(cx1 - cx0)),
            h: Math.round(Math.abs(cy1 - cy0)),
          };
          const x1 = clamp(snapEdge(sx, R2.cellsX), 0, R2.out.width);
          const y1 = clamp(snapEdge(sy, R2.cellsY), 0, R2.out.height);
          const mx = clamp(
            Math.round(Math.min(marqDrag.x0, x1)),
            0,
            R2.out.width - 1,
          );
          const my = clamp(
            Math.round(Math.min(marqDrag.y0, y1)),
            0,
            R2.out.height - 1,
          );
          const mw = clamp(
            Math.round(Math.abs(x1 - marqDrag.x0)),
            0,
            R2.out.width - mx,
          );
          const mh = clamp(
            Math.round(Math.abs(y1 - marqDrag.y0)),
            0,
            R2.out.height - my,
          );
          state.marquee = { x: mx, y: my, w: mw, h: mh };
          drawFramesOverlay();
          if (mw >= 1 && mh >= 1) positionMarqueeBtn();
        }
      });
      fov.addEventListener("pointerup", () => {
        if (marqDrag) {
          marqDrag = null;
          if (
            state.marquee &&
            state.marquee.w >= 1 &&
            state.marquee.h >= 1 &&
            marqMoved
          ) {
            $("#marqAddBtn").disabled = false;
            positionMarqueeBtn();
          } else {
            state.marquee = null;
            $("#marqueeAdd").style.display = "none";
            drawFramesOverlay();
          }
        }
      });
      fov.addEventListener("click", (e) => {
        if (marqMoved) {
          marqMoved = false;
          return;
        }
        if (state.frameMode === "marquee") return;
        const src = curSrc();
        if (!src || !src.result) return;
        const R = src.result;
        const r = fov.getBoundingClientRect();
        const sx = (e.clientX - r.left) / framesZ,
          sy = (e.clientY - r.top) / framesZ;
        if (state.frameMode === "auto") {
          const reg = getAutoslice(src).find(
            (g) => sx >= g.x && sx < g.x + g.w && sy >= g.y && sy < g.y + g.h,
          );
          if (reg) addFrames([createFrame(src, reg)]);
        } else if (state.frameMode === "grid") {
          const cols = clamp(num($("#gridCols").value, 4), 1, 64),
            rows = clamp(num($("#gridRows").value, 4), 1, 64);
          const c = Math.floor(sx / (R.out.width / cols)),
            rr = Math.floor(sy / (R.out.height / rows));
          if (c >= 0 && c < cols && rr >= 0 && rr < rows) {
            const reg = gridRegions(R.out.width, R.out.height, cols, rows)[
              rr * cols + c
            ];
            if (reg) addFrames([createFrame(src, reg)]);
          }
        }
      });

