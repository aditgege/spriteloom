      /* =============== CLIP · Tray-is-Clip v1 timing presets =============== */
      /* Whole Tray order IS the Clip. Presets stamp an ms pattern across
         the tray (loop when longer, trim when shorter). Classic script. */
      const CLIP_PRESETS = {
        breathe: [600, 150, 150, 600],
        blink: [500, 125, 80, 500],
        walk: [100, 100, 100, 100],
        run: [80, 80, 80, 80, 80, 80],
        attack: [120, 80, 200, 100],
        hit: [80, 300],
      };
      function frameMs(f) {
        if (!f || f.ms == null) return 125;
        const v = Math.round(f.ms);
        if (!Number.isFinite(v)) return 125;
        return v < 10 ? 10 : v > 5000 ? 5000 : v;
      }
      function stampPattern(frames, pattern) {
        const pat = (Array.isArray(pattern) ? pattern : []).map((v) =>
          clamp(Math.round(v), 10, 5000),
        ).filter((v) => Number.isFinite(v));
        if (!Array.isArray(frames) || !frames.length || !pat.length) return frames;
        for (let i = 0; i < frames.length; i++)
          frames[i].ms = pat[i % pat.length];
        return frames;
      }
      function clipTotalMs(frames) {
        if (!Array.isArray(frames) || !frames.length) return 0;
        return frames.reduce((s, f) => s + frameMs(f), 0);
      }
      function getClipInfo(name, frames) {
        const list = Array.isArray(frames) ? frames : state.frames;
        return { name: name || state.clipName || null, n: list.length, totalMs: clipTotalMs(list) };
      }
      function snapshotClipMs(frames, name) {
        const list = Array.isArray(frames) ? frames : state.frames;
        return { name: name != null ? name : state.clipName || null, ms: list.map((f) => frameMs(f)) };
      }
      function restoreClipMs(frames, snap) {
        if (!snap || !Array.isArray(snap.ms)) return frames;
        for (let i = 0; i < frames.length && i < snap.ms.length; i++)
          frames[i].ms = clamp(Math.round(snap.ms[i]), 10, 5000);
        if (snap.name !== undefined) state.clipName = snap.name;
        return frames;
      }
      function serializeClip(name, frames) {
        const list = Array.isArray(frames) ? frames : state.frames;
        return JSON.stringify({ name: name || state.clipName || null, pattern: list.map((f) => frameMs(f)) });
      }
      function deserializeClip(json) {
        const o = typeof json === "string" ? JSON.parse(json) : json;
        return { name: o.name || null, pattern: (Array.isArray(o.pattern) ? o.pattern : []).map((v) => clamp(Math.round(v), 10, 5000)) };
      }
      function applyClipPreset(name) {
        const pat = CLIP_PRESETS[name];
        if (!pat) return toast("Unknown clip preset", "warn");
        if (!state.frames.length) return toast("No frames to stamp", "warn");
        if (typeof pushUndo === "function") pushUndo();
        const snap = snapshotClipMs(state.frames, state.clipName);
        stampPattern(state.frames, pat);
        state.clipName = name;
        state._clipUndo = snap;
        playerDirty = true;
        if (typeof renderTray === "function") renderTray();
        if (typeof drawFa === "function") { try { drawFa(); } catch (e) {} }
        if (typeof renderStackPanel === "function") { try { renderStackPanel(); } catch (e) {} }
        if (state.mode === "align" && typeof renderAlignView === "function") { try { renderAlignView(); } catch (e) {} }
        if (typeof invalidateSheet === "function") invalidateSheet();
        const info = getClipInfo(name, state.frames);
        if (typeof updateClipRead === "function") { try { updateClipRead(); } catch (e) {} }
        toast(`Clip ${name} → ${info.n} frames · ${info.totalMs}ms`);
        return info;
      }
      if (typeof state.clipName === "undefined") state.clipName = null;
      function updateClipRead() {
        const info = getClipInfo(state.clipName, state.frames);
        const r = (typeof $ === "function") ? $("#clipRead") : null;
        if (r) r.textContent = info.n
          ? `CLIP ${info.name || "—"} · ${info.n} frames · ${info.totalMs}ms`
          : "—";
        const t = (typeof $ === "function") ? $("#clipTotal") : null;
        if (t) t.textContent = info.n ? `${info.n} · ${info.totalMs}ms` : "—";
      }
      (function wireClip() {
        const seg = (typeof $ === "function") ? $("#clipPresetSeg") : null;
        if (seg && !seg._wired) {
          seg._wired = true;
          seg.addEventListener("click", (e) => {
            const b = e.target.closest("button");
            if (!b) return;
            if (typeof segSelect === "function") segSelect(seg, b);
            applyClipPreset(b.dataset.clip);
          });
        }
        updateClipRead();
        if (window.lucide && typeof refreshIcons === "function") refreshIcons();
      })();
