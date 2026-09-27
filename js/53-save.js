      /* =============== 53 · project save / load =============== */
      /* Save frames + sheet + stack as JSON (frame pixels as PNG dataURL).
         Sources saved as PNG dataURL + params so snap can be rebuilt.
         Classic script, file:// safe. */
      function canvasToDataURL(cv) {
        try { return cv.toDataURL("image/png"); } catch (e) { return null; }
      }
      function dataURLToCanvas(url) {
        return loadImage(url).then((img) => {
          const cv = document.createElement("canvas");
          cv.width = img.naturalWidth || img.width;
          cv.height = img.naturalHeight || img.height;
          cv.getContext("2d").drawImage(img, 0, 0);
          return cv;
        });
      }
      function saveProject() {
        if (!state.frames.length && !state.sources.length)
          return toast("Nothing to save yet", "warn");
        const frames = state.frames.map((f) => ({
          name: f.name,
          w: f.w, h: f.h,
          png: canvasToDataURL(f.canvas),
          bounds: f.bounds,
          anchor: f.anchor, pax: f.pax, pay: f.pay,
          zoom: f.zoom, ox: f.ox || 0, oy: f.oy || 0,
          ms: f.ms != null ? f.ms : 125,
          srcLabel: (state.sources.find((s) => s.id === f.srcId) || {}).label || null,
        }));
        if (frames.some((f) => !f.png)) return toast("Save failed — canvas tainted?", "err");
        const sources = state.sources.map((s) => ({
          name: s.name, label: s.label,
          png: canvasToDataURL(s.raw),
          params: s.params,
          skipped: !!(s.result && s.result.skipped),
        }));
        const st = (typeof stackState === "function") ? stackState() : null;
        const proj = {
          app: "SpriteLoom", kind: "project", version: 1,
          savedAt: new Date().toISOString(),
          sheet: { ...state.sheet },
          stack: st ? { order: [], hidden: st.hidden, ghost: st.ghost, tint: st.tint, solo: false } : null,
          frameOrder: state.frames.map((f) => f.name),
          stackOrderNames: st ? st.order.map((id) => {
            const f = state.frames.find((x) => x.id === id);
            return f ? f.name : null;
          }).filter(Boolean) : [],
          selFrameName: (selFrameObj() || {}).name || null,
          frameCounter: state.frameCounter,
          clip: { name: state.clipName != null ? state.clipName : null },
          frames, sources,
        };
        // stack order stored by name (ids change on load)
        const blob = new Blob([JSON.stringify(proj)], { type: "application/json" });
        downloadBlob(blob, "spritelloom-project.json");
        toast(`Saved ${frames.length} frames + ${sources.length} sources`);
      }
      async function loadProjectFile(file) {
        let proj = null;
        try {
          proj = JSON.parse(await file.text());
        } catch (e) { return toast("Invalid project file", "err"); }
        if (!proj || proj.app !== "SpriteLoom" || !Array.isArray(proj.frames))
          return toast("Not a SpriteLoom project", "err");
        try {
          // rebuild sources first (so frames can link by label)
          state.sources = [];
          state.selSrc = null;
          const labelToId = {};
          for (const s of (proj.sources || [])) {
            if (!s.png) continue;
            const cv = await dataURLToCanvas(s.png);
            const w = cv.width, h = cv.height;
            const rawData = cv.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h);
            const src = {
              id: uid(),
              name: s.name || "source",
              label: s.label || "img",
              raw: cv, rawData,
              thumb: makeThumb(cv),
              params: { k: 12, auto: true, snap: true, pitchX: 8, pitchY: 8, offX: 0, offY: 0, ...(s.params || {}) },
              result: null,
            };
            state.sources.push(src);
            if (src.label) labelToId[src.label] = src.id;
            if (s.skipped) {
              if (typeof skipSnapFor === "function") skipSnapFor(src);
              else { runSnap(src); }
            } else runSnap(src);
          }
          if (state.sources.length) state.selSrc = state.sources[state.sources.length - 1].id;
          // rebuild frames
          state.frames = [];
          const nameToId = {};
          for (const sf of proj.frames) {
            if (!sf.png) continue;
            const cv = await dataURLToCanvas(sf.png);
            const id = uid();
            const f = {
              id,
              name: sf.name || ("frame-" + id),
              w: cv.width, h: cv.height,
              canvas: cv,
              bounds: sf.bounds || { x: 0, y: 0, w: cv.width, h: cv.height },
              anchor: sf.anchor ?? null,
              pax: sf.pax, pay: sf.pay,
              zoom: sf.zoom || 1,
              ox: sf.ox || 0, oy: sf.oy || 0,
              ms: sf.ms != null ? sf.ms : 125,
              srcId: (sf.srcLabel && labelToId[sf.srcLabel]) || (state.sources[0] || {}).id || null,
            };
            state.frames.push(f);
            nameToId[f.name] = id;
          }
          // restore order (frameOrder) if present
          if (Array.isArray(proj.frameOrder) && proj.frameOrder.length) {
            const byName = new Map(state.frames.map((f) => [f.name, f]));
            const ordered = [];
            for (const nm of proj.frameOrder) {
              const f = byName.get(nm);
              if (f) { ordered.push(f); byName.delete(nm); }
            }
            for (const f of byName.values()) ordered.push(f);
            state.frames = ordered;
          }
          if (proj.sheet && typeof proj.sheet === "object")
            Object.assign(state.sheet, proj.sheet);
          state.frameCounter = proj.frameCounter || {};
          state.clipName = (proj.clip && proj.clip.name) || null;
          undoStack.length = 0;
          // selection
          state.selFrame = (proj.selFrameName && nameToId[proj.selFrameName]) || (state.frames[0] || {}).id || null;
          state.player.i = 0;
          // stack order by name
          if (state.stack) state.stack.order = [];
          if (typeof stackState === "function") {
            const st = stackState();
            if (Array.isArray(proj.stackOrderNames) && proj.stackOrderNames.length)
              st.order = proj.stackOrderNames.map((nm) => nameToId[nm]).filter((v) => v != null);
            else st.order = state.frames.map((f) => f.id);
            st.hidden = [];
            if (proj.stack && typeof proj.stack.ghost === "number") st.ghost = proj.stack.ghost;
            if (proj.stack && typeof proj.stack.tint === "boolean") st.tint = proj.stack.tint;
            st.solo = false;
          }
          renderRail();
          updateCounts();
          syncSnapUI();
          renderTray();
          invalidateSheet();
          updateFrameSec();
          if (typeof renderStackPanel === "function") { try { renderStackPanel(); } catch (e) {} }
          if (state.mode === "align" && typeof renderAlignView === "function") { try { renderAlignView(); } catch (e) {} }
          else setMode(state.frames.length ? "sheet" : "snap");
          toast(`Loaded ${state.frames.length} frames`);
        } catch (e) {
          console.error(e);
          toast("Load failed — " + (e && e.message ? e.message : e), "err");
        }
      }
      function skipSnapFor(src) {
        const W = src.rawData.width, H = src.rawData.height;
        const outCanvas = document.createElement("canvas");
        outCanvas.width = W; outCanvas.height = H;
        outCanvas.getContext("2d").putImageData(src.rawData, 0, 0);
        src.result = {
          q: null,
          cellsX: seq(W), cellsY: seq(H),
          out: src.rawData, outCanvas,
          pitchX: 0, pitchY: 0, offX: 0, offY: 0,
          candsX: [], candsY: [], pitchFallback: false, skipped: true,
        };
      }
      (function wireSaveLoad() {
        const sv = $("#topSave");
        if (sv) sv.addEventListener("click", saveProject);
        const ld = $("#topLoad");
        const pi = $("#projectInput");
        if (ld && pi) {
          ld.addEventListener("click", () => pi.click());
          pi.addEventListener("change", (e) => {
            const f = e.target.files && e.target.files[0];
            e.target.value = "";
            if (f) loadProjectFile(f);
          });
        }
        if (window.lucide && typeof refreshIcons === "function") refreshIcons();
      })();
