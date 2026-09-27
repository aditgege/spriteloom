      /* =============== rail / chrome =============== */
      function renderRail() {
        const list = $("#railList");
        list.innerHTML = "";
        state.sources.forEach((s) => {
          const d = el("div", "src" + (s.id === state.selSrc ? " on" : ""));
          d.dataset.id = String(s.id);
          const cv = document.createElement("canvas");
          cv.width = 120;
          cv.height = 72;
          cv.getContext("2d").drawImage(s.thumb, 0, 0);
          d.appendChild(cv);
          const R = s.result;
          if (R && (R.pitchX >= 2 || R.pitchY >= 2))
            d.appendChild(
              el("span", "pitchchip", `${R.out.width}×${R.out.height}`),
            );
          const rm = el("button", "iconbtn");
          rm.title = "Remove source";
          rm.innerHTML = '<i data-lucide="x"></i>';
          rm.addEventListener("click", (ev) => {
            ev.stopPropagation();
            removeSource(s.id);
          });
          d.appendChild(rm);
          d.appendChild(el("div", "nm", s.name));
          d.appendChild(
            el("div", "dm", `${s.rawData.width}×${s.rawData.height}`),
          );
          d.addEventListener("click", () => selectSource(s.id));
          list.appendChild(d);
        });
        refreshIcons();
      }
      function updateCounts() {
        const n = state.frames.length;
        const chip = $("#frameCountChip");
        chip.style.display = n ? "inline-block" : "none";
        chip.textContent = `${n} FRAMES`;
        let trayTxt = `${n} FRAMES`;
        if (n && typeof getClipInfo === "function") {
          try {
            const ci = getClipInfo(state.clipName, state.frames);
            if (ci && ci.totalMs) trayTxt += ` · ${ci.totalMs}ms`;
          } catch (e) {}
        }
        $("#trayCount").textContent = trayTxt;
        $("#railCount").textContent = String(state.sources.length);
        $("#toSheetBtn").disabled = !n;
        $("#exportPng").disabled = !n;
        $("#exportJson").disabled = !n;
        $("#topExport").disabled = !n;
        $("#curRead").textContent = n
          ? `${n} frame${n > 1 ? "s" : ""} curated · drag the tray to set sheet order`
          : "No frames yet. Extract some above.";
      }
      function updateStepper() {
        $$("#stepper .step").forEach((b) =>
          b.classList.toggle("on", b.dataset.mode === state.mode),
        );
      }
      function updateInspector() {
        $$(".sec[data-m]").forEach((s) => {
          const modes = String(s.dataset.m || "").split(/\s+/);
          s.style.display = modes.includes(state.mode) ? "flex" : "none";
        });
      }
      function setMode(m) {
        state.mode = m;
        updateStepper();
        renderWorkspace();
        updateInspector();
        updateCounts();
        if (m === "sheet" || m === "align") playerDirty = true;
        updateFrameSec();
        if ((m === "sheet" || m === "align") && typeof renderStackPanel === "function") {
          try { renderStackPanel(); } catch (e) {}
        }
        if (m === "align" && typeof renderAlignView === "function") {
          try { renderAlignView(); } catch (e) {}
        }
      }
      function renderWorkspace() {
        const has = state.sources.length > 0;
        $("#dropHero").style.display = has ? "none" : "flex";
        $("#snapView").style.display = "none";
        $("#framesView").style.display = "none";
        $("#sheetView").style.display = "none";
        const av = $("#alignView");
        if (av) av.style.display = "none";
        if (!has) return;
        if (state.mode === "snap") {
          $("#snapView").style.display = "flex";
          renderSnapView();
        } else if (state.mode === "frames") {
          $("#framesView").style.display = "flex";
          renderFramesView();
        } else if (state.mode === "align") {
          if (av) av.style.display = "flex";
          if (typeof renderAlignView === "function") renderAlignView();
        } else {
          $("#sheetView").style.display = "flex";
          renderSheetView();
        }
      }

      /* =============== export =============== */
      function exportPng() {
        if (!state.frames.length) return toast("No frames to export", "warn");
        if (state.mode !== "sheet") setMode("sheet");
        renderSheetView();
        const sh = sheetCache;
        if (!sh) return;
        const S = state.sheet;
        const cv = document.createElement("canvas");
        cv.width = sh.W;
        cv.height = sh.H;
        const ctx = cv.getContext("2d");
        if (S.bg === "solid") {
          ctx.fillStyle = S.bgColor;
          ctx.fillRect(0, 0, sh.W, sh.H);
        }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage($("#sheetCanvas"), 0, 0);
        cv.toBlob((b) => {
          if (!b) return toast("Export failed", "err");
          downloadBlob(b, "spritesheet.png");
          toast(
            `Exported ${sh.W}×${sh.H} spritesheet · ${state.frames.length} frames`,
          );
        }, "image/png");
      }
      function exportAtlas(format) {
        if (!state.frames.length) return toast("No frames to export", "warn");
        if (!sheetCache) {
          if (state.mode !== "sheet") setMode("sheet");
          renderSheetView();
        }
        const sh = sheetCache;
        if (!sh) return;
        const S = state.sheet;
        const fmt = format || S.atlasFormat || "spritelloom";
        const frames = state.frames.map((f, i) => {
          const L = sh.layout[i],
            b = sh.contents[i].b,
            FA = frameAnchor(f);
          return {
            name: f.name,
            frame: { x: L.dx, y: L.dy, w: L.dw, h: L.dh },
            rotated: false,
            trimmed: S.trim,
            spriteSourceSize: { x: b.x, y: b.y, w: b.w, h: b.h },
            sourceSize: { w: f.w, h: f.h },
            pivot: { x: +FA.ax.toFixed(4), y: +FA.ay.toFixed(4) },
            anchor: f.anchor || S.anchor,
            cell: { x: L.col, y: L.row, w: sh.cellW, h: sh.cellH },
            zoom: f.zoom,
            duration: clamp(Math.round(f.ms != null ? f.ms : 1000 / Math.max(1, S.fps)), 10, 5000),
          };
        });
        const baseMeta = {
          app: "SpriteLoom",
          image: "spritesheet.png",
          size: { w: sh.W, h: sh.H },
          scale: sh.scale,
          grid: { cols: sh.cols, rows: sh.rows },
          cell: { w: sh.cellW, h: sh.cellH },
          anchor: S.anchor,
          trim: S.trim,
          fps: S.fps,
        };
        let atlas = null;
        if (fmt === "phaser") {
          const phFrames = {};
          frames.forEach((f) => {
            phFrames[f.name] = {
              frame: { x: f.frame.x, y: f.frame.y, w: f.frame.w, h: f.frame.h },
              rotated: f.rotated,
              trimmed: f.trimmed,
              spriteSourceSize: f.spriteSourceSize,
              sourceSize: f.sourceSize,
              pivot: f.pivot,
            };
          });
          atlas = { frames: phFrames, meta: baseMeta };
        } else if (fmt === "unity") {
          atlas = {
            sprites: frames.map((f) => ({
              name: f.name,
              rect: { x: f.frame.x, y: f.frame.y, width: f.frame.w, height: f.frame.h },
              pivot: { x: f.pivot.x, y: 1 - f.pivot.y },
              spriteSourceSize: f.spriteSourceSize,
              sourceSize: f.sourceSize,
            })),
            meta: baseMeta,
          };
        } else if (fmt === "texturepacker") {
          atlas = {
            frames: frames.map((f) => ({
              filename: f.name,
              frame: { x: f.frame.x, y: f.frame.y, w: f.frame.w, h: f.frame.h },
              rotated: f.rotated,
              trimmed: f.trimmed,
              spriteSourceSize: f.spriteSourceSize,
              sourceSize: f.sourceSize,
            })),
            meta: baseMeta,
          };
        } else {
          atlas = { meta: baseMeta, frames };
        }
        downloadBlob(
          new Blob([JSON.stringify(atlas, null, 2)], {
            type: "application/json",
          }),
          "spritesheet.json",
        );
        toast(`Atlas exported (${fmt}) · ${frames.length} frames`);
      }
      function exportJson() {
        exportAtlas(state.sheet.atlasFormat || "spritelloom");
      }

      /* =============== animation loop =============== */
      let lastT = performance.now();
      function tick(t) {
        const dt = Math.min(120, t - lastT);
        lastT = t;
        if (!state.sources.length) heroStep(dt);
        if ((state.mode === "sheet" || state.mode === "align") && state.frames.length) {
          if (state.player.playing) {
            state.player.acc += dt;
            let guard = 0;
            while (guard++ < 32) {
              const cur = state.frames[state.player.i];
              const iv = cur && cur.ms != null
                ? clamp(Math.round(cur.ms), 10, 5000)
                : 1000 / Math.max(1, state.sheet.fps);
              if (state.player.acc < iv) break;
              state.player.acc -= iv;
              state.player.i = (state.player.i + 1) % state.frames.length;
              playerDirty = true;
            }
          }
          if (playerDirty) {
            drawPlayer();
            if (state.mode === "align" && typeof renderAlignView === "function") {
              try { renderAlignView(); } catch (e) {}
            }
            playerDirty = false;
          }
        }
        requestAnimationFrame(tick);
      }

      /* =============== wiring =============== */
      $("#stepper").addEventListener("click", (e) => {
        const b = e.target.closest(".step");
        if (b) setMode(b.dataset.mode);
      });
      $("#railAdd").onclick = () => $("#fileInput").click();
      $("#heroUpload").onclick = () => $("#fileInput").click();
      $("#heroDemo").onclick = makeDemo;
      $("#fileInput").addEventListener("change", (e) => {
        addFiles(e.target.files);
        e.target.value = "";
      });
      $("#toFramesBtn").onclick = () => setMode("frames");
      $("#toSheetBtn").onclick = () => setMode("sheet");
      $("#emptyGoFrames").onclick = () => setMode("frames");
      $("#topExport").onclick = exportPng;
      $("#exportPng").onclick = exportPng;
      $("#exportJson").onclick = exportJson;
      $("#trayUndo").onclick = doUndo;
      $("#trayClear").onclick = () => {
        if (!state.frames.length) return;
        pushUndo();
        state.frames = [];
        state.selFrame = null;
        renderTray();
        updateCounts();
        invalidateSheet();
        updateFrameSec();
        toast("Tray cleared — Ctrl+Z brings it back");
      };

      /* snap controls */
      $("#kRange").addEventListener("input", (e) => {
        const src = curSrc();
        if (!src) return;
        src.params.k = num(e.target.value, 12);
        $("#kVal").textContent = src.params.k;
        rerunSnapD();
      });
      $("#snapModeSeg").addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        segSelect(e.currentTarget, b);
        const src = curSrc();
        if (!src) return;
        const wantAuto = b.dataset.v === "auto";
        if (!wantAuto && src.result) {
          if (src.result.pitchX >= 2) {
            src.params.pitchX = src.result.pitchX;
            src.params.offX = src.result.offX;
          }
          if (src.result.pitchY >= 2) {
            src.params.pitchY = src.result.pitchY;
            src.params.offY = src.result.offY;
          }
        }
        src.params.auto = wantAuto;
        syncSnapUI();
        rerunSnap();
      });
      const man = (id, key) => {
        $("#" + id).addEventListener("input", (e) => {
          const src = curSrc();
          if (!src) return;
          src.params[key] = num(e.target.value, src.params[key]);
          if (src.params.auto) {
            src.params.auto = false;
            segSelect($("#snapModeSeg"), $('#snapModeSeg [data-v="manual"]'));
            syncSnapUI();
          }
          rerunSnapD();
        });
      };
      man("mPitchX", "pitchX");
      man("mPitchY", "pitchY");
      man("mOffX", "offX");
      man("mOffY", "offY");
      $("#snapEdges").addEventListener("change", (e) => {
        const src = curSrc();
        if (!src) return;
        src.params.snap = e.target.checked;
        rerunSnap();
      });

      /* split handle */
      {
        const handle = $("#splitHandle"),
          box = $("#splitBox");
        handle.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          handle.setPointerCapture(e.pointerId);
          const move = (ev) => {
            const r = box.getBoundingClientRect();
            if (!r.width) return;
            state.split = clamp(((ev.clientX - r.left) / r.width) * 100, 3, 97);
            drawSplit();
          };
          const up = () => {
            handle.removeEventListener("pointermove", move);
            handle.removeEventListener("pointerup", up);
          };
          handle.addEventListener("pointermove", move);
          handle.addEventListener("pointerup", up);
        });
        box.addEventListener("dblclick", () => {
          snapFlip = !snapFlip;
          drawSplit();
        });
      }

      /* frames controls */
      $("#frameModeSeg").addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        segSelect(e.currentTarget, b);
        state.frameMode = b.dataset.v;
        $("#fmAuto").style.display = state.frameMode === "auto" ? "" : "none";
        $("#fmGrid").style.display = state.frameMode === "grid" ? "" : "none";
        $("#fmMarq").style.display =
          state.frameMode === "marquee" ? "" : "none";
        hoverRect = null;
        hoverCell = null;
        marqDrag = null;
        state.marquee = null;
        $("#marqueeAdd").style.display = "none";
        $("#framesHint").textContent =
          state.frameMode === "auto"
            ? "click a region to add it"
            : state.frameMode === "grid"
              ? "click a cell to add it"
              : "drag to select · Enter adds the frame";
        if (state.frameMode === "auto") updAutoRead();
        drawFramesOverlay();
        updateFramesBar();
      });
      $("#autoAddBtn").onclick = () => {
        const src = curSrc();
        if (!src || !src.result) return;
        const regs = getAutoslice(src);
        addFrames(
          regs.map((r) => createFrame(src, r)),
          `${regs.length} regions`,
        );
      };
      const updGridLbl = () => {
        const c = clamp(num($("#gridCols").value, 4), 1, 64),
          r = clamp(num($("#gridRows").value, 4), 1, 64);
        $("#gridAddLbl").textContent = `Slice ${c}×${r} grid`;
      };
      $("#gridCols").addEventListener("input", updGridLbl);
      $("#gridRows").addEventListener("input", updGridLbl);
      $("#gridAddBtn").onclick = () => {
        const src = curSrc();
        if (!src || !src.result) return;
        const cols = clamp(num($("#gridCols").value, 4), 1, 64),
          rows = clamp(num($("#gridRows").value, 4), 1, 64);
        const regs = gridRegions(
          src.result.out.width,
          src.result.out.height,
          cols,
          rows,
        );
        addFrames(
          regs.map((r) => createFrame(src, r)),
          `${cols}×${rows} grid`,
        );
      };
      $("#marqAddBtn").onclick = addMarquee;
      $("#maBtn").onclick = addMarquee;

      /* zoom segs */
      $("#framesZoomSeg").addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        segSelect(e.currentTarget, b);
        state.framesZoom = +b.dataset.z;
        if (state.mode === "frames") renderFramesView();
      });
      $("#sheetZoomSeg").addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        segSelect(e.currentTarget, b);
        state.sheetZoom = +b.dataset.z;
        if (state.mode === "sheet" && state.frames.length) renderSheetView();
      });

      /* sheet controls */
      const shIn = (id, key) => {
        $("#" + id).addEventListener("input", (e) => {
          state.sheet[key] = num(e.target.value, state.sheet[key]);
          invalidateSheet();
          persistPrefsD();
        });
      };
      shIn("sheetCols", "cols");
      shIn("cellW", "cellW");
      shIn("cellH", "cellH");
      shIn("sheetSpacing", "spacing");
      shIn("sheetMargin", "margin");
      $("#cellSeg").addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        segSelect(e.currentTarget, b);
        state.sheet.autoCell = b.dataset.v === "auto";
        $("#cellDims").style.display = state.sheet.autoCell ? "none" : "grid";
        invalidateSheet();
      });
      $("#scaleSeg").addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        segSelect(e.currentTarget, b);
        state.sheet.scale = +b.dataset.s;
        invalidateSheet();
        persistPrefsD();
      });
      $("#anchorGrid").addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        state.sheet.anchor = b.dataset.a;
        [...$("#anchorGrid").querySelectorAll("button")].forEach((x) =>
          x.classList.toggle("on", x === b),
        );
        $("#anchorLabel").textContent = ANCHOR_LABELS[state.sheet.anchor];
        invalidateSheet();
        const f = selFrameObj();
        if (f) drawFa();
      });
      $("#trimToggle").addEventListener("change", (e) => {
        state.sheet.trim = e.target.checked;
        invalidateSheet();
        persistPrefsD();
        const f = selFrameObj();
        if (f) drawFa();
      });
      $("#bgSeg").addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        segSelect(e.currentTarget, b);
        state.sheet.bg = b.dataset.v;
        $("#bgColorField").style.display =
          state.sheet.bg === "solid" ? "flex" : "none";
      });
      $("#bgColor").addEventListener("input", (e) => {
        state.sheet.bgColor = e.target.value;
      });

      /* player controls */
      $("#ppPlay").addEventListener("click", () => {
        state.player.playing = !state.player.playing;
        $("#ppPlay").classList.toggle("on", state.player.playing);
      });
      $("#ppPrev").onclick = () => stepPlayer(-1);
      $("#ppNext").onclick = () => stepPlayer(1);
      $("#ppOnion").addEventListener("click", () => {
        state.sheet.onion = !state.sheet.onion;
        $("#ppOnion").classList.toggle("on", state.sheet.onion);
        playerDirty = true;
      });
      $("#ppFps").addEventListener("input", (e) => {
        state.sheet.fps = clamp(num(e.target.value, 8), 1, 24);
        $("#ppFpsV").textContent = state.sheet.fps;
        persistPrefsD();
      });

      /* batch snap + prefs */
      function batchSnapAll() {
        const cur = curSrc();
        if (!cur) return toast("No sources to re-snap", "warn");
        const keep = state.selSrc;
        let n = 0;
        state.sources.forEach((s) => {
          if (!s.result) return;
          s.params.k = cur.params.k;
          if (cur.params.palette !== undefined)
            s.params.palette = cur.params.palette;
          if (cur.params.dither !== undefined)
            s.params.dither = cur.params.dither;
          runSnap(s);
          n++;
        });
        state.selSrc = keep;
        renderRail();
        syncSnapUI();
        if (state.mode === "snap") renderSnapView();
        if (state.mode === "frames") renderFramesView();
        toast(`Re-snapped ${n} source${n === 1 ? "" : "s"} · K=${cur.params.k}`);
      }
      const PREFS_KEY = "spritelloom.prefs.v1";
      function persistPrefs() {
        try {
          const S = state.sheet;
          localStorage.setItem(
            PREFS_KEY,
            JSON.stringify({
              fps: S.fps,
              scale: S.scale,
              cols: S.cols,
              trim: S.trim,
            }),
          );
        } catch (e) {}
      }
      const persistPrefsD = debounce(persistPrefs, 250);
      function restorePrefs() {
        let p = null;
        try {
          p = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
        } catch (e) {
          p = null;
        }
        if (!p || typeof p !== "object") return;
        const S = state.sheet;
        if (p.fps != null) S.fps = clamp(num(p.fps, S.fps), 1, 24);
        if (p.scale != null) S.scale = clamp(+p.scale || S.scale, 1, 8);
        if (p.cols != null) S.cols = clamp(num(p.cols, S.cols), 1, 64);
        if (typeof p.trim === "boolean") S.trim = p.trim;
        try {
          const sc = $("#sheetCols");
          if (sc) sc.value = S.cols;
          const tm = $("#trimToggle");
          if (tm) tm.checked = S.trim;
          const fp = $("#ppFps");
          if (fp) fp.value = S.fps;
          const fv = $("#ppFpsV");
          if (fv) fv.textContent = S.fps;
          const seg = $("#scaleSeg");
          if (seg) {
            const btn = seg.querySelector(`[data-s="${S.scale}"]`);
            if (btn) segSelect(seg, btn);
          }
        } catch (e) {}
      }

      /* drag & drop, paste, resize, keys */
      let dragDepth = 0;
      window.addEventListener("dragenter", (e) => {
        if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) {
          e.preventDefault();
          dragDepth++;
          $("#dropVeil").classList.add("on");
        }
      });
      window.addEventListener("dragover", (e) => e.preventDefault());
      window.addEventListener("dragleave", () => {
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) $("#dropVeil").classList.remove("on");
      });
      window.addEventListener("drop", (e) => {
        e.preventDefault();
        dragDepth = 0;
        $("#dropVeil").classList.remove("on");
        if (e.dataTransfer && e.dataTransfer.files.length)
          addFiles(e.dataTransfer.files);
      });
      window.addEventListener("paste", (e) => {
        const items = [
          ...((e.clipboardData && e.clipboardData.items) || []),
        ].filter((i) => i.type.startsWith("image/"));
        if (!items.length) return;
        e.preventDefault();
        items.forEach((it) => {
          const f = it.getAsFile();
          if (f) addFiles([f]);
        });
      });
      window.addEventListener(
        "resize",
        debounce(() => {
          if (!state.sources.length) return;
          if (state.mode === "snap") renderSnapView();
          else if (state.mode === "frames") renderFramesView();
          else if (state.mode === "align") {
            if (typeof renderAlignView === "function") renderAlignView();
          }
          else if (state.frames.length) renderSheetView();
        }, 150),
      );
      window.addEventListener("keydown", (e) => {
        if (e.target.closest("input,textarea,select")) return;
        if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
          e.preventDefault();
          doUndo();
          return;
        }
        if (
          state.mode === "frames" &&
          e.key === "Enter" &&
          state.frameMode === "marquee" &&
          state.marquee
        ) {
          addMarquee();
          return;
        }
        if (
          (e.key === "Delete" || e.key === "Backspace") &&
          state.selFrame != null
        ) {
          e.preventDefault();
          deleteFrame(state.selFrame);
          return;
        }
        if (state.mode === "frames" && state.frames.length) {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const d = e.key === "ArrowRight" ? 1 : -1;
            const i = state.frames.findIndex((f) => f.id === state.selFrame);
            const n = state.frames.length;
            const nx = i < 0 ? (d > 0 ? 0 : n - 1) : (i + d + n) % n;
            selectFrame(state.frames[nx].id);
            return;
          }
          if (e.key === "d" || e.key === "D") {
            const f = selFrameObj();
            if (f) {
              e.preventDefault();
              duplicateFrame(f);
            }
            return;
          }
        }
        if (state.mode === "sheet" && state.frames.length) {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            stepPlayer(-1);
          }
          if (e.key === "ArrowRight") {
            e.preventDefault();
            stepPlayer(1);
          }
        }
        if (state.mode === "align" && state.frames.length) {
          const step = e.shiftKey ? 5 : 1;
          if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
            const f = selFrameObj();
            if (!f) return;
            e.preventDefault();
            const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
            const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
            if (typeof nudgeFrame === "function") nudgeFrame(f.id, dx, dy);
            else {
              f.ox = clamp(Math.round(f.ox || 0) + dx, -64, 64);
              f.oy = clamp(Math.round(f.oy || 0) + dy, -64, 64);
              invalidateSheet();
            }
            if (typeof renderAlignView === "function") {
              try { renderAlignView(); } catch (err) {}
            }
            return;
          }
          if (e.key === " " && typeof state.player !== "undefined") {
            e.preventDefault();
            state.player.playing = !state.player.playing;
            const b = $("#alPlay");
            if (b) b.classList.toggle("on", state.player.playing);
            return;
          }
        }
      });

      /* =============== init =============== */
      function init() {
        restorePrefs();
        setMode("snap");
        syncSnapUI();
        renderTray();
        updateCounts();
        refreshIcons();
        requestAnimationFrame(tick);
      }
      init();
