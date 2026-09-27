/* =============== state =============== */
const ANCHORS = {
  tl: { ax: 0, ay: 0 },
  tc: { ax: 0.5, ay: 0 },
  tr: { ax: 1, ay: 0 },
  ml: { ax: 0, ay: 0.5 },
  mc: { ax: 0.5, ay: 0.5 },
  mr: { ax: 1, ay: 0.5 },
  bl: { ax: 0, ay: 1 },
  bc: { ax: 0.5, ay: 1 },
  br: { ax: 1, ay: 1 },
};
const ANCHOR_LABELS = {
  tl: "TOP LEFT",
  tc: "TOP CENTER",
  tr: "TOP RIGHT",
  ml: "MIDDLE LEFT",
  mc: "CENTER",
  mr: "MIDDLE RIGHT",
  bl: "BOTTOM LEFT",
  bc: "BOTTOM CENTER",
  br: "BOTTOM RIGHT",
};
const state = {
  sources: [],
  selSrc: null,
  mode: "snap",
  frames: [],
  selFrame: null,
  frameCounter: {},
  frameMode: "auto",
  gridCols: 4,
  gridRows: 4,
  marquee: null,
  sheet: {
    cols: 4,
    autoCell: true,
    cellW: 16,
    cellH: 16,
    spacing: 0,
    margin: 0,
    scale: 1,
    anchor: "bc",
    trim: true,
    bg: "transparent",
    bgColor: "#1b1917",
      fps: 8,
      onion: true,
      atlasFormat: "spritelloom",
  },
  framesZoom: 0,
  sheetZoom: 0,
  split: 50,
  player: { i: 0, playing: false, acc: 0 },
};
const curSrc = () =>
  state.sources.find((s) => s.id === state.selSrc) || null;
const selFrameObj = () =>
  state.frames.find((f) => f.id === state.selFrame) || null;
/* module-level view caches */
let framesZ = 1,
  sheetCache = null,
  hoverRect = null,
  sheetHoverI = -1,
  ovDirty = false,
  marqDrag = null,
  faDraw = null,
  playerDirty = true,
  heroFrame = 0,
  heroAcc = 0,
  trayDrag = null,
  undoStack = [];
const dropLine = el("div", "drop-line");
