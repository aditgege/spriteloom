import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const clipPath = path.join(here, "..", "js", "33-clip.js");

function loadClip() {
  if (!fs.existsSync(clipPath))
    throw new Error("33-clip.js not implemented");
  const src = fs.readFileSync(clipPath, "utf8");
  const sandbox = {
    console,
    state: { frames: [], sheet: { fps: 8 }, player: { i: 0, playing: false, acc: 0 }, clipName: null },
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    num: (v, d) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : d;
    },
    pushUndo: () => {},
    invalidateSheet: () => {},
    renderTray: () => {},
    drawFa: () => {},
    renderStackPanel: () => {},
    renderAlignView: () => {},
    selFrameObj: () => null,
    toast: () => {},
    segSelect: () => {},
    $: () => null,
    document: { activeElement: null },
    window: {},
    localStorage: { getItem: () => null, setItem: () => {} },
    playerDirty: false,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src + "\n;globalThis.__clip = { CLIP_PRESETS, frameMs, stampPattern, applyClipPreset, getClipInfo, clipTotalMs, snapshotClipMs, restoreClipMs, serializeClip, deserializeClip };", sandbox, { filename: "33-clip.js" });
  return sandbox.globalThis.__clip;
}

test("TEST-CLIP-00: 33-clip.js exists", () => {
  assert.ok(fs.existsSync(clipPath), "33-clip.js not implemented");
});

test("TEST-CLIP-01: six presets exact", () => {
  const clip = loadClip();
  assert.deepEqual(clip.CLIP_PRESETS.breathe, [600, 150, 150, 600]);
  assert.deepEqual(clip.CLIP_PRESETS.blink, [500, 125, 80, 500]);
  assert.deepEqual(clip.CLIP_PRESETS.walk, [100, 100, 100, 100]);
  assert.deepEqual(clip.CLIP_PRESETS.run, [80, 80, 80, 80, 80, 80]);
  assert.deepEqual(clip.CLIP_PRESETS.attack, [120, 80, 200, 100]);
  assert.deepEqual(clip.CLIP_PRESETS.hit, [80, 300]);
});

test("TEST-CLIP-02: frameMs clamp 10-5000 default 125", () => {
  const clip = loadClip();
  assert.equal(clip.frameMs(null), 125);
  assert.equal(clip.frameMs({}), 125);
  assert.equal(clip.frameMs({ ms: 5 }), 10);
  assert.equal(clip.frameMs({ ms: 9999 }), 5000);
  assert.equal(clip.frameMs({ ms: 250 }), 250);
});

test("TEST-CLIP-03: loop/trim stamp", () => {
  const clip = loadClip();
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, ms: 125 }));
  const t4 = clip.stampPattern(mk(4), [600, 150, 150, 600]);
  assert.deepEqual(t4.map((f) => f.ms), [600, 150, 150, 600]);
  const t3 = clip.stampPattern(mk(3), [600, 150, 150, 600]);
  assert.deepEqual(t3.map((f) => f.ms), [600, 150, 150]);
  const t6 = clip.stampPattern(mk(6), [80, 300]);
  assert.deepEqual(t6.map((f) => f.ms), [80, 300, 80, 300, 80, 300]);
});

test("TEST-CLIP-04: getClipInfo/clipTotalMs", () => {
  const clip = loadClip();
  const frames = [{ ms: 600 }, { ms: 150 }, { ms: 150 }, { ms: 600 }];
  assert.equal(clip.clipTotalMs(frames), 1500);
  const info = clip.getClipInfo("breathe", frames);
  assert.equal(info.name, "breathe");
  assert.equal(info.n, 4);
  assert.equal(info.totalMs, 1500);
});

test("TEST-CLIP-05: order preservation", () => {
  const clip = loadClip();
  const frames = [{ id: 3, ms: 1 }, { id: 1, ms: 1 }, { id: 2, ms: 1 }];
  const out = clip.stampPattern(frames, [10, 20, 30]);
  assert.deepEqual(out.map((f) => f.id), [3, 1, 2]);
  assert.deepEqual(out.map((f) => f.ms), [10, 20, 30]);
});

test("TEST-CLIP-06: undo snapshot round-trip", () => {
  const clip = loadClip();
  const frames = [{ ms: 125 }, { ms: 125 }];
  const snap = clip.snapshotClipMs(frames, "walk");
  frames[0].ms = 600;
  clip.restoreClipMs(frames, snap);
  assert.deepEqual(frames.map((f) => f.ms), [125, 125]);
});

test("TEST-CLIP-08: save/load clip JSON round-trip", () => {
  const clip = loadClip();
  const json = clip.serializeClip("attack", [{ ms: 120 }, { ms: 80 }]);
  const back = clip.deserializeClip(json);
  assert.equal(back.name, "attack");
  assert.deepEqual(back.pattern, [120, 80]);
});
