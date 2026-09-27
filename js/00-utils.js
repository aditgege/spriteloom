/* =============== utilities =============== */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const num = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
let _uid = 1;
const uid = () => _uid++;
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
function refreshIcons() {
  try {
    window.lucide && lucide.createIcons();
  } catch (e) {}
}
function loadImage(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = url;
  });
}
function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function toast(msg, kind = "ok") {
  const wrap = $("#toasts");
  while (wrap.children.length > 3) wrap.firstChild.remove();
  const t = el(
    "div",
    "toast" + (kind === "warn" || kind === "err" ? " warn" : ""),
  );
  t.innerHTML = `<i data-lucide="${kind === "warn" ? "alert-triangle" : kind === "err" ? "x" : "check"}"></i><span></span>`;
  t.querySelector("span").textContent = msg;
  wrap.appendChild(t);
  refreshIcons();
  requestAnimationFrame(() => t.classList.add("in"));
  setTimeout(() => {
    t.classList.remove("in");
    setTimeout(() => t.remove(), 220);
  }, 3600);
}
