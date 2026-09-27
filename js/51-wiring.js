/* =============== 51 · wave-2 control wiring (DOM only, no algorithms) =============== */
/* Loads AFTER 50-app. Wires wave-1 APIs to the new inspector controls:
   parsePaletteHex / rerunSnap / lockPixelSize / applySheetPreset /
   sheetWarning / batchSnapAll / persistPrefsD. Classic script, file:// safe. */
(function () {
      "use strict";
      var PREFS_KEY = "spritelloom.wave2.v1";
      function saveWave2() {
            try {
                  var src = curSrc();
                  localStorage.setItem(PREFS_KEY, JSON.stringify({
                        palette: src && src.params ? (src.params.palette || null) : null,
                        dither: !!(src && src.params && src.params.dither)
                  }));
            } catch (e) {}
      }
      function syncWave2UI() {
            try {
                  var src = curSrc();
                  var pal = $("#paletteHex");
                  if (pal && document.activeElement !== pal)
                        pal.value = (src && src.params && src.params.palette) || "";
                  var dt = $("#ditherToggle");
                  if (dt) dt.checked = !!(src && src.params && src.params.dither);
            } catch (e) {}
      }
      function refreshSheetWarn() {
            try {
                  var w = $("#sheetWarn");
                  if (!w) return;
                  var msg = (typeof sheetWarning === "function") ? sheetWarning() : "";
                  w.textContent = msg || "";
                  w.style.display = msg ? "block" : "none";
            } catch (e) {}
      }
      function syncSheetInputs() {
            try {
                  var S = state.sheet;
                  var sc = $("#sheetCols");
                  if (sc && document.activeElement !== sc) sc.value = S.cols;
                  var cw = $("#cellW");
                  if (cw) cw.value = S.cellW;
                  var ch = $("#cellH");
                  if (ch) ch.value = S.cellH;
                  var seg = $("#cellSeg");
                  if (seg) {
                        var btn = seg.querySelector('[data-v="' + (S.autoCell ? "auto" : "manual") + '"]');
                        if (btn && typeof segSelect === "function") segSelect(seg, btn);
                  }
                  var cd = $("#cellDims");
                  if (cd) cd.style.display = S.autoCell ? "none" : "grid";
                  var ss = $("#scaleSeg");
                  if (ss) {
                        var sb = ss.querySelector('[data-s="' + S.scale + '"]');
                        if (sb && typeof segSelect === "function") segSelect(ss, sb);
                  }
            } catch (e) {}
      }
      var pa = $("#paletteApply");
      if (pa) pa.addEventListener("click", function () {
            var src = curSrc();
            if (!src) return toast("No source selected", "warn");
            var raw = $("#paletteHex").value || "";
            var pal = parsePaletteHex(raw);
            if (!pal.length) return toast("No valid hex colors found", "warn");
            src.params.palette = pal;
            rerunSnap();
            syncWave2UI();
            saveWave2();
            toast("Custom palette applied · " + pal.length + " colors");
      });
      var pc = $("#paletteClear");
      if (pc) pc.addEventListener("click", function () {
            var src = curSrc();
            if (!src) return;
            src.params.palette = null;
            var pal = $("#paletteHex");
            if (pal) pal.value = "";
            rerunSnap();
            saveWave2();
            toast("Custom palette cleared");
      });
      var dt = $("#ditherToggle");
      if (dt) dt.addEventListener("change", function (e) {
            var src = curSrc();
            if (!src) return;
            src.params.dither = !!e.target.checked;
            rerunSnap();
            saveWave2();
            toast(e.target.checked ? "Dither resample on" : "Dither resample off");
      });
      var pl = $("#pixelLockBtn");
      if (pl) pl.addEventListener("click", function () {
            var src = curSrc();
            if (!src || !src.result) return toast("No snapped source yet", "warn");
            if (!lockPixelSize(src)) return toast("Nothing to lock", "warn");
            if (typeof segSelect === "function") {
                  var mb = $('#snapModeSeg [data-v="manual"]');
                  if (mb) segSelect($("#snapModeSeg"), mb);
            }
            syncSnapUI();
            rerunSnap();
            toast("Pixel size locked to detected pitch");
      });
      var ps = $("#presetSeg");
      if (ps) ps.addEventListener("click", function (e) {
            var b = e.target.closest("button");
            if (!b) return;
            if (typeof segSelect === "function") segSelect(ps, b);
            applySheetPreset(b.dataset.p);
            if (typeof persistPrefsD === "function") persistPrefsD();
            syncSheetInputs();
            refreshSheetWarn();
            toast("Sheet preset · " + b.textContent);
      });
      var sk = $("#skipSnapBtn");
      if (sk) sk.addEventListener("click", function () {
            if (typeof skipSnapCurrent === "function") skipSnapCurrent();
      });
      var bb = $("#batchSnapBtn");
      if (bb) bb.addEventListener("click", function () {
            if (typeof batchSnapAll === "function") batchSnapAll();
            syncWave2UI();
            saveWave2();
      });
      var rail = $("#railList");
      if (rail) rail.addEventListener("click", function () {
            setTimeout(syncWave2UI, 0);
      });
      var tsheet = $("#toSheetBtn");
      if (tsheet) tsheet.addEventListener("click", function () {
            setTimeout(refreshSheetWarn, 0);
      });
      try {
            var saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
            if (saved && typeof saved === "object") {
                  if (saved.palette && $("#paletteHex")) $("#paletteHex").value = saved.palette;
                  if (typeof saved.dither === "boolean" && $("#ditherToggle"))
                        $("#ditherToggle").checked = saved.dither;
            }
      } catch (e) {}
      var af = $("#atlasFormat");
      if (af) {
            try { af.value = (state.sheet && state.sheet.atlasFormat) || "spritelloom"; } catch (e) {}
            af.addEventListener("change", function (e) {
                  state.sheet.atlasFormat = e.target.value || "spritelloom";
            });
      }
      var pseg = $("#packerSeg");
      if (pseg) {
            try {
                  var curP = (state.sheet && state.sheet.packer) || "grid";
                  var pb = pseg.querySelector('[data-packer="' + curP + '"]');
                  if (pb && typeof segSelect === "function") segSelect(pseg, pb);
                  var bt = $("#bleedToggle");
                  if (bt) bt.checked = !!(state.sheet && state.sheet.bleed);
            } catch (e) {}
            pseg.addEventListener("click", function (e) {
                  var b = e.target.closest("button");
                  if (!b) return;
                  if (typeof segSelect === "function") segSelect(pseg, b);
                  if (typeof setPacker === "function") setPacker(b.dataset.packer);
                  refreshSheetWarn();
            });
      }
      var bt2 = $("#bleedToggle");
      if (bt2) bt2.addEventListener("change", function (e) {
            if (typeof setBleed === "function") setBleed(!!e.target.checked);
            refreshSheetWarn();
      });
      var nudge = function (id, dx, dy) {
            var f = (typeof selFrameObj === "function") ? selFrameObj() : null;
            if (!f) return;
            var step = 1;
            if (typeof nudgeFrame === "function") nudgeFrame(f.id, dx * step, dy * step);
      };
      var wireN = function (id, dx, dy) {
            var b = $(id);
            if (b && !b._wired) {
              b._wired = true;
              b.addEventListener("click", function (e) {
                var s = (e.shiftKey ? 5 : 1);
                nudge(id, dx * s, dy * s);
              });
            }
      };
      wireN("#fxLeft", -1, 0);
      wireN("#fxRight", 1, 0);
      wireN("#fyUp", 0, -1);
      wireN("#fyDown", 0, 1);
      var fxR = $("#fxReset");
      if (fxR && !fxR._wired) {
        fxR._wired = true;
        fxR.addEventListener("click", function () {
          var f = (typeof selFrameObj === "function") ? selFrameObj() : null;
          if (!f) return;
          if (typeof resetFrameOffset === "function") resetFrameOffset(f.id);
          if (typeof drawFa === "function") drawFa();
        });
      }
      var fxI = $("#fxOff"), fyI = $("#fyOff");
      if (fxI && !fxI._wired) {
        fxI._wired = true;
        fxI.addEventListener("change", function () {
          var f = (typeof selFrameObj === "function") ? selFrameObj() : null;
          if (!f) return;
          var oy = fyI ? num(fyI.value, 0) : 0;
          if (typeof setFrameOffset === "function") setFrameOffset(f.id, num(fxI.value, 0), oy);
          if (typeof drawFa === "function") drawFa();
        });
      }
      if (fyI && !fyI._wired) {
        fyI._wired = true;
        fyI.addEventListener("change", function () {
          var f = (typeof selFrameObj === "function") ? selFrameObj() : null;
          if (!f) return;
          var ox = fxI ? num(fxI.value, 0) : 0;
          if (typeof setFrameOffset === "function") setFrameOffset(f.id, ox, num(fyI.value, 0));
          if (typeof drawFa === "function") drawFa();
        });
      }
      var tl = $("#trayList");
      if (tl && !tl._wheelWired) {
        tl._wheelWired = true;
        tl.addEventListener("wheel", function (e) {
          if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
          if (tl.scrollWidth <= tl.clientWidth + 1) return;
          e.preventDefault();
          tl.scrollLeft += e.deltaY + e.deltaX;
        }, { passive: false });
      }
      var fdm = $("#fdMs");
      if (fdm && !fdm._wired) {
        fdm._wired = true;
        fdm.addEventListener("change", function () {
          var f = (typeof selFrameObj === "function") ? selFrameObj() : null;
          if (!f) return;
          var v = clamp(num(fdm.value, 125), 10, 5000);
          if (typeof pushUndo === "function") pushUndo();
          f.ms = v;
          fdm.value = v;
          playerDirty = true;
          if (typeof drawFa === "function") drawFa();
          if (typeof renderTray === "function") renderTray();
          if (typeof renderStackPanel === "function") { try { renderStackPanel(); } catch (e) {} }
          if (state.mode === "align" && typeof renderAlignView === "function") { try { renderAlignView(); } catch (e) {} }
        });
      }
      var fda = $("#fdAll");
      if (fda && !fda._wired) {
        fda._wired = true;
        fda.addEventListener("click", function () {
          var f = (typeof selFrameObj === "function") ? selFrameObj() : null;
          if (!f || !state.frames.length) return;
          var v = clamp(Math.round(f.ms != null ? f.ms : 125), 10, 5000);
          if (typeof pushUndo === "function") pushUndo();
          state.frames.forEach(function (x) { x.ms = v; });
          playerDirty = true;
          if (typeof renderTray === "function") renderTray();
          toast("All frames → " + v + "ms");
        });
      }
      var fdp = $("#fdPreset");
      if (fdp && !fdp._wired) {
        fdp._wired = true;
        fdp.addEventListener("click", function (e) {
          var b = e.target.closest("button");
          if (!b) return;
          var f = (typeof selFrameObj === "function") ? selFrameObj() : null;
          if (!f) return toast("Select a frame first", "warn");
          var v = clamp(num(b.dataset.ms, 125), 10, 5000);
          if (typeof segSelect === "function") segSelect(fdp, b);
          if (typeof pushUndo === "function") pushUndo();
          f.ms = v;
          var fdm0 = $("#fdMs");
          if (fdm0) fdm0.value = v;
          playerDirty = true;
          if (typeof drawFa === "function") drawFa();
          if (typeof renderTray === "function") renderTray();
          if (typeof renderStackPanel === "function") { try { renderStackPanel(); } catch (err) {} }
          if (state.mode === "align" && typeof renderAlignView === "function") { try { renderAlignView(); } catch (err) {} }
        });
      }
      var rb = $("#trayRename");
      if (rb) rb.addEventListener("click", function () {
            if (typeof bulkRenamePrompt === "function") bulkRenamePrompt();
      });
      var db = $("#trayDelSel");
      if (db) db.addEventListener("click", function () {
            if (typeof deleteSelected === "function") deleteSelected();
      });
      var dupb = $("#trayDupSel");
      if (dupb) dupb.addEventListener("click", function () {
            if (typeof duplicateSelected === "function") duplicateSelected();
      });
      syncWave2UI();
      refreshSheetWarn();
      if (window.lucide) refreshIcons();
})();
