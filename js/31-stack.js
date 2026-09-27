      /* =============== STACK · anchor-match compositor =============== */
      /* All frames stacked on the sheet anchor. Active frame opaque on top,
         the rest tinted ghosts with distinct colors. Classic script. */
      const STACK_COLORS = [
        "#29adff", "#ff4d6d", "#98ce00", "#c07cff",
        "#ff9e00", "#00d0b0", "#ff7ad9", "#8d9eff",
      ];
      function stackState() {
        if (!state.stack || typeof state.stack !== "object")
          state.stack = { order: [], hidden: [], ghost: 0.45, tint: true, solo: false };
        const st = state.stack;
        if (!Array.isArray(st.order)) st.order = [];
        if (!Array.isArray(st.hidden)) st.hidden = [];
        if (typeof st.ghost !== "number") st.ghost = 0.45;
        if (typeof st.tint !== "boolean") st.tint = true;
        if (typeof st.solo !== "boolean") st.solo = false;
        const ids = new Set(state.frames.map((f) => f.id));
        st.order = st.order.filter((id) => ids.has(id));
        for (const f of state.frames)
          if (!st.order.includes(f.id)) st.order.push(f.id);
        st.hidden = st.hidden.filter((id) => ids.has(id));
        return st;
      }
      function stackColor(id) {
        const st = stackState();
        const i = st.order.indexOf(id);
        return STACK_COLORS[((i % STACK_COLORS.length) + STACK_COLORS.length) % STACK_COLORS.length];
      }
      function stackOrderedFrames() {
        const st = stackState();
        const byId = new Map(state.frames.map((f) => [f.id, f]));
        return st.order.map((id) => byId.get(id)).filter(Boolean);
      }
      function ensureStackHooks() {
        if (ensureStackHooks._done) return;
        ensureStackHooks._done = true;
        try {
          if (typeof selectFrame === "function" && !selectFrame._stackHooked) {
            const orig = selectFrame;
            const wrapped = function (id) {
              const r = orig.apply(this, arguments);
              try { renderStackPanel(); } catch (e) {}
              return r;
            };
            wrapped._stackHooked = true;
            selectFrame = wrapped;
          }
        } catch (e) {}
        try {
          if (typeof renderTray === "function" && !renderTray._stackHooked) {
            const orig = renderTray;
            const wrapped = function () {
              const r = orig.apply(this, arguments);
              try { renderStackPanel(); } catch (e) {}
              return r;
            };
            wrapped._stackHooked = true;
            renderTray = wrapped;
          }
        } catch (e) {}
        try {
          if (typeof updateFrameSec === "function" && !updateFrameSec._stackHooked) {
            const orig = updateFrameSec;
            const wrapped = function () {
              const r = orig.apply(this, arguments);
              try { renderStackPanel(); } catch (e) {}
              return r;
            };
            wrapped._stackHooked = true;
            updateFrameSec = wrapped;
          }
        } catch (e) {}
      }
      function setStackActive(id) {
        const st = stackState();
        if (typeof selectFrame === "function") selectFrame(id);
        else state.selFrame = id;
        st.solo = false;
        renderStackPanel();
      }
      function moveStackActive(d) {
        const st = stackState();
        const id = state.selFrame;
        if (id == null) return;
        const i = st.order.indexOf(id);
        const j = i + d;
        if (i < 0 || j < 0 || j >= st.order.length) return;
        const t = st.order[i];
        st.order[i] = st.order[j];
        st.order[j] = t;
        renderStackPanel();
        toast(`Stack ${d < 0 ? "↑" : "↓"} ${state.frames.find((f) => f.id === id)?.name || ""}`);
      }
      function stackToTop() {
        const st = stackState();
        const id = state.selFrame;
        if (id == null) return;
        st.order = st.order.filter((x) => x !== id);
        st.order.push(id);
        renderStackPanel();
      }
      function toggleStackHidden(id) {
        const st = stackState();
        st.hidden = st.hidden.includes(id)
          ? st.hidden.filter((x) => x !== id)
          : [...st.hidden, id];
        renderStackPanel();
      }
      function tintedDraw(ctx, f, b, dx, dy, dw, dh, color, alpha) {
        const off = document.createElement("canvas");
        off.width = Math.max(1, Math.round(dw));
        off.height = Math.max(1, Math.round(dh));
        const oc = off.getContext("2d");
        oc.imageSmoothingEnabled = false;
        oc.drawImage(f.canvas, b.x, b.y, b.w, b.h, 0, 0, off.width, off.height);
        oc.globalCompositeOperation = "source-atop";
        oc.globalAlpha = 1;
        oc.fillStyle = color;
        oc.fillRect(0, 0, off.width, off.height);
        oc.globalCompositeOperation = "source-over";
        ctx.globalAlpha = alpha;
        ctx.drawImage(off, Math.round(dx), Math.round(dy), off.width, off.height);
        ctx.globalAlpha = 1;
      }
      function drawStack() {
        const cv = $("#stackCanvas");
        if (!cv) return;
        const ctx = cv.getContext("2d");
        ctx.clearRect(0, 0, 246, 148);
        ctx.fillStyle = "#151310";
        ctx.fillRect(0, 0, 246, 148);
        const st = stackState();
        const list = stackOrderedFrames().filter((f) => !st.hidden.includes(f.id));
        const read = $("#stackRead");
        const cnt = $("#stackCount");
        if (cnt) cnt.textContent = String(state.frames.length);
        if (!list.length) {
          if (read) read.textContent = state.frames.length ? "all hidden" : "—";
          return;
        }
        const S = state.sheet;
        const SA = (typeof ANCHORS !== "undefined" && ANCHORS[S.anchor]) || { ax: 0.5, ay: 1 };
        const infos = list.map((f) => {
          const b = S.trim ? { ...f.bounds } : { x: 0, y: 0, w: f.w, h: f.h };
          const ox = (typeof clamp === "function" ? clamp(Math.round(f.ox || 0), -64, 64) : (f.ox || 0));
          const oy = (typeof clamp === "function" ? clamp(Math.round(f.oy || 0), -64, 64) : (f.oy || 0));
          return { f, b, cw: b.w * f.zoom, ch: b.h * f.zoom, ox, oy };
        });
        let mcw = 1, mch = 1;
        for (const c of infos) {
          mcw = Math.max(mcw, c.cw);
          mch = Math.max(mch, c.ch);
        }
        const s = Math.min(206 / mcw, 108 / mch);
        const ax = 123, ay = 126;
        ctx.imageSmoothingEnabled = false;
        const activeId = state.selFrame;
        const ordered = st.solo && activeId != null
          ? infos.filter((c) => c.f.id === activeId)
          : infos;
        for (const c of ordered) {
          const isActive = c.f.id === activeId;
          if (!isActive && st.solo) continue;
          const FA = (typeof frameAnchor === "function") ? frameAnchor(c.f) : SA;
          const w = c.cw * s, h = c.ch * s;
          const dx = Math.round(ax - w * FA.ax + c.ox * s);
          const dy = Math.round(ay - h * FA.ay + c.oy * s);
          if (isActive) continue; // active drawn last, opaque on top
          if (st.tint) tintedDraw(ctx, c.f, c.b, dx, dy, w, h, stackColor(c.f.id), st.ghost);
          else {
            ctx.globalAlpha = st.ghost;
            ctx.drawImage(c.f.canvas, c.b.x, c.b.y, c.b.w, c.b.h, dx, dy, Math.round(w), Math.round(h));
            ctx.globalAlpha = 1;
          }
        }
        const act = ordered.find((c) => c.f.id === activeId);
        if (act) {
          const FA = (typeof frameAnchor === "function") ? frameAnchor(act.f) : SA;
          const w = act.cw * s, h = act.ch * s;
          const dx = Math.round(ax - w * FA.ax + act.ox * s);
          const dy = Math.round(ay - h * FA.ay + act.oy * s);
          ctx.drawImage(act.f.canvas, act.b.x, act.b.y, act.b.w, act.b.h, dx, dy, Math.round(w), Math.round(h));
        }
        // anchor cross LAST — always visible
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
        if (read) {
          const an = (typeof selFrameObj === "function" && selFrameObj()) ? selFrameObj().name : "—";
          read.textContent = `ACTIVE ${an} · ${ordered.length}/${list.length} shown · ghosts ${Math.round(st.ghost * 100)}%`;
        }
      }
      function renderStackList() {
        const box = $("#stackList");
        if (!box) return;
        const st = stackState();
        box.innerHTML = "";
        const topFirst = [...stackOrderedFrames()].reverse();
        if (!topFirst.length) {
          const d = el("div", "hint", "No frames yet. Extract some first.");
          box.appendChild(d);
          return;
        }
        topFirst.forEach((f, ti) => {
          const row = el("div", "stk-row" + (f.id === state.selFrame ? " on" : "") + (st.hidden.includes(f.id) ? " off" : ""));
          const dot = el("i", "stk-dot");
          dot.style.background = stackColor(f.id);
          const nm = el("span", "stk-name", f.name);
          const idx = el("span", "stk-idx", String(st.order.indexOf(f.id) + 1).padStart(2, "0"));
          const eye = el("button", "iconbtn stk-eye" + (st.hidden.includes(f.id) ? " off" : ""));
          eye.title = st.hidden.includes(f.id) ? "Show" : "Hide";
          eye.innerHTML = '<i data-lucide="' + (st.hidden.includes(f.id) ? "eye-off" : "eye") + '"></i>';
          eye.addEventListener("click", (ev) => {
            ev.stopPropagation();
            toggleStackHidden(f.id);
          });
          row.append(dot, nm, idx, eye);
          row.title = (ti === 0 ? "TOP · " : "") + f.name + " — click to activate";
          row.addEventListener("click", () => setStackActive(f.id));
          box.appendChild(row);
        });
        refreshIcons();
      }
      function renderStackPanel() {
        ensureStackHooks();
        const sec = $("#stackSec");
        if (!sec) return;
        if (state.mode !== "sheet" && state.mode !== "align") return;
        stackState();
        renderStackList();
        drawStack();
      }
      (function wireStack() {
        const up = $("#stackUp");
        if (up) up.addEventListener("click", () => moveStackActive(1));
        const dn = $("#stackDown");
        if (dn) dn.addEventListener("click", () => moveStackActive(-1));
        const tp = $("#stackTop");
        if (tp) tp.addEventListener("click", stackToTop);
        const so = $("#stackSolo");
        if (so) so.addEventListener("click", () => {
          const st = stackState();
          st.solo = !st.solo;
          so.classList.toggle("on", st.solo);
          renderStackPanel();
        });
        const al = $("#stackShowAll");
        if (al) al.addEventListener("click", () => {
          const st = stackState();
          st.hidden = [];
          st.solo = false;
          const s2 = $("#stackSolo");
          if (s2) s2.classList.remove("on");
          renderStackPanel();
        });
        const gh = $("#stackGhost");
        if (gh) gh.addEventListener("input", (e) => {
          const st = stackState();
          st.ghost = clamp(num(e.target.value, 45), 5, 90) / 100;
          const v = $("#stackGhostV");
          if (v) v.textContent = Math.round(st.ghost * 100) + "%";
          drawStack();
        });
        const tt = $("#stackTint");
        if (tt) tt.addEventListener("change", (e) => {
          stackState().tint = !!e.target.checked;
          drawStack();
        });
        try {
          const st = stackState();
          if (gh) gh.value = Math.round(st.ghost * 100);
          const v = $("#stackGhostV");
          if (v) v.textContent = Math.round(st.ghost * 100) + "%";
          if (tt) tt.checked = st.tint;
        } catch (e) {}
        renderStackPanel();
        refreshIcons();
      })();
