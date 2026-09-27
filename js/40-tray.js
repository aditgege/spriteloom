      /* =============== frame tray =============== */
      function selSet() {
        if (!(state.selFrames instanceof Set)) {
          const init = Array.isArray(state.selFrames)
            ? state.selFrames
            : (state.selFrame != null ? [state.selFrame] : []);
          state.selFrames = new Set(init);
        }
        return state.selFrames;
      }
      function getSelectedIds() {
        const s = selSet();
        return state.frames.filter((f) => s.has(f.id)).map((f) => f.id);
      }
      function updateTraySelCount() {
        return;
      }
      function sheetSnap() {
        const S = state.sheet;
        return {
          cols: S.cols,
          cellW: S.cellW,
          cellH: S.cellH,
          scale: S.scale,
          anchor: S.anchor,
          spacing: S.spacing,
          margin: S.margin,
        };
      }
      function pushUndo() {
        undoStack.push({
          frames: [...state.frames],
          selFrame: state.selFrame,
          selFrames: [...selSet()],
          sheet: sheetSnap(),
          ms: state.frames.map((f) => ({ id: f.id, ms: f.ms != null ? f.ms : 125 })),
          clipName: state.clipName != null ? state.clipName : null,
        });
        if (undoStack.length > 60) undoStack.shift();
      }
      function doUndo() {
        const prev = undoStack.pop();
        if (!prev) {
          toast("Nothing to undo");
          return;
        }
        const snap = Array.isArray(prev)
          ? { frames: prev, selFrame: null, sheet: null }
          : prev;
        state.frames = snap.frames || [];
        state.selFrame = snap.selFrame != null ? snap.selFrame : null;
        if (Array.isArray(snap.selFrames)) state.selFrames = new Set(snap.selFrames);
        else selSet();
        if (
          state.selFrame != null &&
          !state.frames.some((f) => f.id === state.selFrame)
        )
          state.selFrame = null;
        selSet();
        state.selFrames.forEach((id) => {
          if (!state.frames.some((f) => f.id === id)) state.selFrames.delete(id);
        });
        if (state.selFrame != null) state.selFrames.add(state.selFrame);
        if (state.selFrame == null) {
          const rest = state.frames.filter((f) => state.selFrames.has(f.id));
          if (rest.length) state.selFrame = rest[0].id;
        }
        if (snap.sheet) Object.assign(state.sheet, snap.sheet);
        if (Array.isArray(snap.ms)) {
          const msById = new Map(snap.ms.map((e) => [e && e.id, e && e.ms]));
          for (const f of state.frames) {
            if (msById.has(f.id))
              f.ms = clamp(Math.round(msById.get(f.id)), 10, 5000);
          }
        }
        if (snap.clipName !== undefined) state.clipName = snap.clipName;
        if (typeof updateClipRead === "function") { try { updateClipRead(); } catch (e) {} }
        renderTray();
        updateCounts();
        invalidateSheet();
        updateFrameSec();
        drawSheetOverlay();
        toast(`Undo — back to ${state.frames.length} frames`);
      }
      function selectFrame(id) {
        state.selFrame = id;
        const s = selSet();
        s.clear();
        if (id != null) s.add(id);
        const i = state.frames.findIndex((x) => x.id === id);
        if (i >= 0) {
          state.player.i = i;
          playerDirty = true;
        }
        renderTray();
        updateFrameSec();
        drawSheetOverlay();
        const it = $(`.frame-item[data-id="${id}"]`);
        if (it) it.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      function toggleSelect(id) {
        const s = selSet();
        if (s.has(id)) {
          s.delete(id);
          if (state.selFrame === id) {
            const rest = getSelectedIds();
            state.selFrame = rest.length ? rest[rest.length - 1] : null;
            const pi = state.frames.findIndex((x) => x.id === state.selFrame);
            if (pi >= 0) {
              state.player.i = pi;
              playerDirty = true;
            }
          }
        } else {
          s.add(id);
          state.selFrame = id;
          const pi = state.frames.findIndex((x) => x.id === id);
          if (pi >= 0) {
            state.player.i = pi;
            playerDirty = true;
          }
        }
        renderTray();
        updateFrameSec();
        drawSheetOverlay();
      }
      function rangeSelect(id) {
        const ids = state.frames.map((x) => x.id);
        const s = selSet();
        const first = [...s][0];
        const anchor = (state.selFrame != null && ids.includes(state.selFrame))
          ? state.selFrame
          : (first != null && ids.includes(first) ? first : id);
        const ai = ids.indexOf(anchor);
        const bi = ids.indexOf(id);
        if (ai < 0 || bi < 0) {
          selectFrame(id);
          return;
        }
        const lo = Math.min(ai, bi);
        const hi = Math.max(ai, bi);
        s.clear();
        for (let k = lo; k <= hi; k++) s.add(ids[k]);
        state.selFrame = id;
        const pi = state.frames.findIndex((x) => x.id === id);
        if (pi >= 0) {
          state.player.i = pi;
          playerDirty = true;
        }
        renderTray();
        updateFrameSec();
        drawSheetOverlay();
      }
      function duplicateFrame(f) {
        pushUndo();
        const copy = { ...f, id: uid(), name: f.name + "·2" };
        const i = state.frames.findIndex((x) => x.id === f.id);
        state.frames.splice(i + 1, 0, copy);
        renderTray();
        updateCounts();
        invalidateSheet();
        toast(`Duplicated ${f.name}`);
      }
      function sanitizeFileName(s) {
        return String(s).trim().replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) || "frame";
      }
      function renameFrame(id, newName) {
        const f = state.frames.find((x) => x.id === id);
        if (!f) return false;
        const nm = sanitizeFileName(newName);
        if (!nm || nm === f.name) return false;
        pushUndo();
        f.name = nm;
        renderTray();
        updateFrameSec();
        invalidateSheet();
        toast(`Renamed to ${nm}`);
        return true;
      }
      function exportSingleFrame(fOrId) {
        const f = typeof fOrId === "number" ? state.frames.find((x) => x.id === fOrId) : fOrId;
        if (!f || !f.canvas) return toast("No frame to export", "warn");
        const name = sanitizeFileName(f.name) + ".png";
        f.canvas.toBlob((b) => {
          if (!b) return toast("Export failed", "err");
          downloadBlob(b, name);
          toast(`Exported ${name} · ${f.w}×${f.h}`);
        }, "image/png");
      }
      function deleteFrame(id) {
        const i = state.frames.findIndex((x) => x.id === id);
        if (i < 0) return;
        pushUndo();
        const f = state.frames.splice(i, 1)[0];
        selSet().delete(id);
        if (state.selFrame === id) {
          const rest = getSelectedIds();
          state.selFrame = rest.length ? rest[0] : null;
        }
        renderTray();
        updateCounts();
        invalidateSheet();
        updateFrameSec();
        toast(`Removed ${f.name}`);
      }
      function renderTray() {
        const list = $("#trayList");
        list.innerHTML = "";
        selSet();
        if (state.selFrame != null && !state.selFrames.has(state.selFrame)) {
          if (state.frames.some((f) => f.id === state.selFrame)) state.selFrames.add(state.selFrame);
          else state.selFrame = null;
        }
        if (state.selFrame == null) {
          const rest = state.frames.filter((f) => state.selFrames.has(f.id));
          if (rest.length) state.selFrame = rest[0].id;
        }
        if (!state.frames.length) {
          const e = el("div");
          e.id = "trayEmpty";
          e.textContent =
            "Frames you extract appear here — drag to reorder, they fill the sheet left to right.";
          list.appendChild(e);
        }
        state.frames.forEach((f, i) => {
          const it = el(
            "div",
            "frame-item" + (state.selFrames.has(f.id) ? " sel" : ""),
          );
          it.dataset.id = String(f.id);
          const th = el("div", "thumb");
          const tcv = document.createElement("canvas");
          const ts = Math.min(66 / f.w, 58 / f.h);
          tcv.width = Math.max(1, Math.round(f.w * ts));
          tcv.height = Math.max(1, Math.round(f.h * ts));
          const tc = tcv.getContext("2d");
          tc.imageSmoothingEnabled = false;
          tc.drawImage(f.canvas, 0, 0, tcv.width, tcv.height);
          th.appendChild(tcv);
          const idx = el("span", "idx", String(i + 1).padStart(2, "0"));
          const acts = el("div", "acts");
          const dup = el("button", "iconbtn");
          dup.title = "Duplicate";
          dup.innerHTML = '<i data-lucide="copy"></i>';
          const exp = el("button", "iconbtn");
          exp.title = "Export frame PNG";
          exp.innerHTML = '<i data-lucide="download"></i>';
          const del = el("button", "iconbtn");
          del.title = "Remove";
          del.innerHTML = '<i data-lucide="trash-2"></i>';
          dup.addEventListener("click", (ev) => {
            ev.stopPropagation();
            duplicateFrame(f);
          });
          exp.addEventListener("click", (ev) => {
            ev.stopPropagation();
            exportSingleFrame(f);
          });
          del.addEventListener("click", (ev) => {
            ev.stopPropagation();
            deleteFrame(f.id);
          });
          acts.append(dup, exp, del);
          const msb = el("span", "ms", (typeof frameMs === "function" ? frameMs(f) : (f.ms != null ? f.ms : 125)) + "ms");
          it.append(th, idx, msb, acts);
          it.addEventListener("pointerdown", (ev) => startTrayDrag(ev, f, it));
          list.appendChild(it);
        });
        updateTraySelCount();
        refreshIcons();
      }
      function startTrayDrag(e, f, it) {
        if (e.button !== 0) return;
        if (e.target.closest(".acts")) return;
        if (e.ctrlKey || e.metaKey) {
          toggleSelect(f.id);
          return;
        }
        if (e.shiftKey) {
          rangeSelect(f.id);
          return;
        }
        if (!selSet().has(f.id)) selectFrame(f.id);
        const sx = e.clientX,
          sy = e.clientY;
        let started = false,
          ghost = null,
          insertAt = -1;
        const list = $("#trayList");
        const move = (ev) => {
          if (!started) {
            if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 6)
              return;
            started = true;
            it.classList.add("dragging");
            ghost = el("div", "drag-ghost");
            const c = document.createElement("canvas");
            const ts = Math.min(60 / f.w, 48 / f.h);
            c.width = Math.max(1, Math.round(f.w * ts));
            c.height = Math.max(1, Math.round(f.h * ts));
            const cc = c.getContext("2d");
            cc.imageSmoothingEnabled = false;
            cc.drawImage(f.canvas, 0, 0, c.width, c.height);
            ghost.appendChild(c);
            document.body.appendChild(ghost);
          }
          ghost.style.left = ev.clientX - 38 + "px";
          ghost.style.top = ev.clientY - 26 + "px";
          const items = [
            ...list.querySelectorAll(".frame-item:not(.dragging)"),
          ];
          insertAt = items.length;
          for (let k = 0; k < items.length; k++) {
            const r = items[k].getBoundingClientRect();
            if (ev.clientX < r.left + r.width / 2) {
              insertAt = k;
              break;
            }
          }
          if (!dropLine.parentNode) list.appendChild(dropLine);
          const ref = items[insertAt] || null;
          if (ref) list.insertBefore(dropLine, ref);
          else list.appendChild(dropLine);
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          if (ghost) ghost.remove();
          dropLine.remove();
          if (started) {
            pushUndo();
            const from = state.frames.findIndex((x) => x.id === f.id);
            const to = clamp(insertAt, 0, state.frames.length);
            state.frames.splice(from, 1);
            state.frames.splice(to, 0, f);
            renderTray();
            invalidateSheet();
            updateCounts();
            toast(`Moved ${f.name} → slot ${to + 1}`);
          } else {
            selectFrame(f.id);
          }
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }
      function deleteSelected() {
        const ids = getSelectedIds();
        if (!ids.length) {
          if (state.selFrame != null) {
            deleteFrame(state.selFrame);
            return true;
          }
          toast("Nothing selected", "warn");
          return false;
        }
        pushUndo();
        const gone = new Set(ids);
        state.frames = state.frames.filter((f) => !gone.has(f.id));
        selSet().clear();
        state.selFrame = null;
        renderTray();
        updateCounts();
        invalidateSheet();
        updateFrameSec();
        toast(`Removed ${ids.length} frames`);
        return true;
      }
      function duplicateSelected() {
        const ids = getSelectedIds();
        if (!ids.length) {
          if (state.selFrame != null) {
            const f = state.frames.find((x) => x.id === state.selFrame);
            if (f) duplicateFrame(f);
            return true;
          }
          toast("Nothing selected", "warn");
          return false;
        }
        pushUndo();
        const newIds = [];
        ids.forEach((id) => {
          const i = state.frames.findIndex((x) => x.id === id);
          if (i < 0) return;
          const f = state.frames[i];
          const copy = { ...f, id: uid(), name: f.name + "·2" };
          state.frames.splice(i + 1, 0, copy);
          newIds.push(copy.id);
        });
        const s = selSet();
        s.clear();
        newIds.forEach((id) => s.add(id));
        state.selFrame = newIds.length ? newIds[newIds.length - 1] : null;
        const pi = state.frames.findIndex((x) => x.id === state.selFrame);
        if (pi >= 0) {
          state.player.i = pi;
          playerDirty = true;
        }
        renderTray();
        updateCounts();
        invalidateSheet();
        toast(`Duplicated ${newIds.length} frames`);
        return true;
      }
      function bulkRename(pattern) {
        let ids = getSelectedIds();
        if (!ids.length && state.selFrame != null) ids = [state.selFrame];
        if (!ids.length || pattern == null || !String(pattern).trim()) return false;
        pushUndo();
        const taken = new Set(state.frames.filter((f) => !selSet().has(f.id)).map((f) => f.name));
        const fresh = [];
        ids.forEach((id, k) => {
          const idx = k + 1;
          let nm = String(pattern);
          nm = nm.replace(/#+/g, (m) => String(idx).padStart(m.length, "0"));
          nm = nm.split("{n}").join(String(idx));
          nm = sanitizeFileName(nm);
          let base = nm;
          let c = 2;
          while (taken.has(nm) || fresh.includes(nm)) nm = sanitizeFileName(base + "_" + (c++));
          fresh.push(nm);
          taken.add(nm);
        });
        ids.forEach((id, k) => {
          const f = state.frames.find((x) => x.id === id);
          if (f) f.name = fresh[k];
        });
        renderTray();
        updateFrameSec();
        invalidateSheet();
        toast(`Renamed ${ids.length} frames`);
        return true;
      }
      function bulkRenamePrompt() {
        const pat = prompt("Rename pattern (use ## or {n} for index, e.g. hero_##):", "frame_##");
        if (pat == null) return false;
        if (!String(pat).trim()) return false;
        return bulkRename(pat);
      }

