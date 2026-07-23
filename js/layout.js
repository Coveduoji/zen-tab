'use strict';
// ── Grid constants ────────────────────────────────────────
const SIZE_RULES = {
  clock:    { minW:3, minH:2, maxW:6, maxH:4, defW:3, defH:2 },
  link:     { minW:1, minH:1, maxW:2, maxH:2, defW:1, defH:1 },
  notes:    { minW:2, minH:2, maxW:6, maxH:6, defW:4, defH:4 },
  todo:     { minW:3, minH:3, maxW:8, maxH:7, defW:5, defH:5 },
  weather:  { minW:3, minH:2, maxW:6, maxH:4, defW:3, defH:2 },
  gtrend:   { minW:3, minH:3, maxW:6, maxH:8, defW:4, defH:5 },
  pomodoro: { minW:2, minH:2, maxW:5, maxH:5, defW:3, defH:3 },
  embed:    { minW:3, minH:3, maxW:8, maxH:8, defW:5, defH:5 },
};
// Widget types whose rendered w:h cell ratio is locked (not freely resizable
// in both dimensions independently). Value is the width/height ratio.
// notes/todo/gtrend/embed are intentionally left unlocked — more space there
// means more visible content (text/cells/list rows), not a distorted icon.
// link is also left unlocked (within its own tight 1-2 cell range via
// SIZE_RULES) — icons should be freely resizable to 1×1/2×1/1×2/2×2, not
// forced square.
const ASPECT_LOCK = { pomodoro: 1, weather: 3/2, clock: 3/2 };
// Absolute sanity ceiling on visibleCols() (e.g. an ultrawide monitor) —
// every placement bound in this file uses the *live* visibleCols() itself,
// not this constant, so a widget can never end up positioned somewhere
// wider than what actually fits on the current screen.
const COLS_MAX    = 20;
const GAP         = 36;
const CELL_TARGET = 60;
// Side margin ≈ 2 grid columns. This can't be computed from the *actual*
// fitted cell width (cw()) without a circular dependency — cw() itself is
// derived from the space left over after the margin — so it's approximated
// from CELL_TARGET, the nominal column size cw() is designed to hover close
// to. Must match #grid-outer's left/right padding in style.css (kept as one
// constant since it's duplicated below and would silently desync layout
// math from the visible padding if only one side were edited).
const OUTER_PAD   = CELL_TARGET * 2;

// ── Cell geometry ─────────────────────────────────────────
function visibleCols() {
  const w = gw();
  const fit = Math.floor((w + GAP) / (CELL_TARGET + GAP));
  return Math.max(1, Math.min(COLS_MAX, fit));
}
// Clamped to >=0 — on a window narrower than the margins themselves
// (OUTER_PAD*2), there's no space for the grid at all; without this floor
// cw() below would go negative and every widget would render inverted/
// zero-width instead of just bottoming out at a single very narrow column.
function gw()      { return Math.max(0, document.getElementById('grid-outer').clientWidth - OUTER_PAD * 2); }
function cw()      { const vc = visibleCols(); return (gw() - GAP * (vc - 1)) / vc; }
function rowH()    { return cw(); }
function cx(col)   { return col * (cw() + GAP); }
function ry(row)   { return row * (rowH() + GAP); }
function px2col(x) { return Math.round(x / (cw() + GAP)); }
function px2row(y) { return Math.round(y / (rowH() + GAP)); }

function wPx(w) {
  const colW = cw(), vc = visibleCols();
  const renderW = Math.min(w.w, vc);
  const width   = renderW * colW + (renderW - 1) * GAP;
  const height  = ASPECT_LOCK[w.type] ? width / ASPECT_LOCK[w.type] : w.h * rowH() + (w.h - 1) * GAP;
  return { left: w.x * (colW + GAP), top: ry(w.y), width, height };
}

function wPxResponsive(w, overrides, geom) {
  // geom lets hot paths (drag/resize mousemove) pass in cell metrics cached
  // once per interaction, instead of re-reading clientWidth (forced reflow)
  // on every call.
  const colW = geom ? geom.colW : cw();
  const vc   = geom ? geom.vc   : visibleCols();
  const rh   = geom ? geom.rowH : rowH();
  const ov   = overrides && overrides[w.id];
  const rw   = ov ? ov.w : Math.min(w.w, vc);
  const rx   = ov ? ov.x : Math.min(w.x, vc - rw);
  const ry_  = ov ? ov.y : w.y;
  const width  = rw * colW + (rw - 1) * GAP;
  const height = ASPECT_LOCK[w.type] ? width / ASPECT_LOCK[w.type] : w.h * rh + (w.h - 1) * GAP;
  return { left: rx * (colW + GAP), top: ry_ * (rh + GAP), width, height };
}

// ── Constraint enforcement ────────────────────────────────
// Bounded by the *visible* column count, not a fixed model width — a widget
// can never end up "logically" past what actually fits on screen, which is
// what let render's display-only clamp silently stack widgets on top of
// each other (see tidyLayout/normalizeToVc). vc can be passed in by callers
// that already computed it (e.g. looping over many widgets) to avoid a
// clientWidth read per widget; single-widget callers can omit it.
function clamp(w, vc) {
  const cols = vc || visibleCols();
  const r = SIZE_RULES[w.type] || { minW:1, minH:1, maxW:cols, maxH:20 };
  w.w = Math.max(r.minW, Math.min(r.maxW, cols, w.w));
  w.h = Math.max(r.minH, Math.min(r.maxH, w.h));
  w.x = Math.max(0, Math.min(cols - w.w, w.x));
  w.y = Math.max(0, w.y);
  return w;
}

function normalizeToVc() {
  const vc = visibleCols();
  state.widgets.forEach(w => clamp(w, vc));
  // Each widget above was clamped independently toward the same right edge —
  // on a big enough shrink, two widgets that were never touching can end up
  // clamped onto the exact same cells. Resolve any resulting overlaps by
  // relocating the later one to the nearest free slot; widgets that are
  // still fine are left untouched.
  const placed = [];
  [...state.widgets].sort((a, b) => a.y - b.y || a.x - b.x).forEach(w => {
    if (getCollisions(w, w.id, placed).length) {
      const slot = findFreeSlot(w.w, w.h, placed, vc);
      w.x = slot.x; w.y = slot.y;
    }
    placed.push(w);
  });
}

// ── Collision detection ───────────────────────────────────
function collides(a, b) {
  if (a.id === b.id) return false;
  return !(a.x+a.w <= b.x || b.x+b.w <= a.x || a.y+a.h <= b.y || b.y+b.h <= a.y);
}

function getCollisions(rect, excludeId, widgets) {
  return widgets.filter(w => w.id !== excludeId && collides(rect, w));
}

// ── Layout algorithms ─────────────────────────────────────
function pushDown(mover, widgets, depth = 0) {
  if (depth > 30) return;
  const hits = getCollisions(mover, mover.id, widgets);
  for (const hit of hits) {
    const vc = visibleCols();
    const candidates = [
      { x: mover.x + mover.w, y: hit.y },
      { x: mover.x - hit.w,   y: hit.y },
      { x: hit.x, y: mover.y + mover.h },
    ];
    let moved = false;
    for (const c of candidates) {
      if (c.x < 0 || c.x + hit.w > vc || c.y < 0) continue;
      const test    = { ...hit, x: c.x, y: c.y };
      const blocked = widgets.some(w => w.id !== hit.id && w.id !== mover.id && collides(test, w));
      if (!blocked) { hit.x = c.x; hit.y = c.y; moved = true; break; }
    }
    if (!moved) {
      // No valid candidate — place below the lowest widget to guarantee no overlap
      const maxBottom = widgets.reduce((m, w) => w.id !== hit.id ? Math.max(m, w.y + w.h) : m, 0);
      hit.y = maxBottom;
    }
    pushDown(hit, widgets, depth + 1);
  }
}

function compact(widgets) {
  const sorted = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed = [];
  for (const w of sorted) {
    let newY = 0;
    while (newY < w.y) {
      if (!placed.some(p => collides({ ...w, y: newY }, p))) { w.y = newY; break; }
      newY++;
    }
    placed.push(w);
  }
}

function findFreeSlot(ww, wh, widgets, maxCols) {
  // Defaults to the current visible column count — a found slot must never
  // sit past what's actually on screen, or render's display-only clamp will
  // silently stack it on top of something else. Callers that already have
  // vc cached (looping over many widgets) can pass it to skip the reflow.
  const cap = maxCols || visibleCols();
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x <= cap - ww; x++) {
      const rect = { id: '__new__', x, y, w: ww, h: wh };
      if (!widgets.some(w => collides(rect, w))) return { x, y };
    }
  }
  // No column fits ww at all (cap < ww — e.g. a widget's own minW is wider
  // than an extremely narrow window). Stack below everything already placed
  // instead of defaulting to (0,0), which would pile every such widget on
  // top of each other.
  const maxBottom = widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0);
  return { x: 0, y: maxBottom };
}

function tidyLayout(widgets) {
  // Bound the repack to the *visible* column count, not the full 20-column
  // model space — this used to have its own scan (duplicating findFreeSlot)
  // capped at COLS, so on a narrower window it could place a widget past
  // what's actually shown; render then clamps its on-screen x back into
  // view, landing it on top of something else that had already been placed.
  const vc = visibleCols();
  const sorted = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed = [];
  for (const w of sorted) {
    const slot = findFreeSlot(w.w, w.h, placed, vc);
    w.x = slot.x; w.y = slot.y;
    placed.push({ ...w });
  }
}

// ── Widget timer / cleanup registry ───────────────────────
const _widgetTimers = new Map();
const _widgetCleanups = new Map();

function registerTimer(widgetId, id) {
  if (!_widgetTimers.has(widgetId)) _widgetTimers.set(widgetId, new Set());
  _widgetTimers.get(widgetId).add(id);
  return id;
}

// registerCleanup lets a widget register an arbitrary teardown callback
// (event listener removal, ResizeObserver disconnect, ...) that isn't a
// timer id — cleanupWidget() runs all of them when the widget is removed.
function registerCleanup(widgetId, fn) {
  if (!_widgetCleanups.has(widgetId)) _widgetCleanups.set(widgetId, []);
  _widgetCleanups.get(widgetId).push(fn);
  return fn;
}

function cleanupWidget(widgetId) {
  const ids = _widgetTimers.get(widgetId);
  if (ids) {
    ids.forEach(id => { clearInterval(id); cancelAnimationFrame(id); });
    _widgetTimers.delete(widgetId);
  }
  const fns = _widgetCleanups.get(widgetId);
  if (fns) {
    fns.forEach(fn => { try { fn(); } catch(_) {} });
    _widgetCleanups.delete(widgetId);
  }
}

// attachAutoScale — shared "fit fixed-composition content into a resizable
// widget" helper (used by clock/pomodoro/weather instead of each widget
// hand-rolling its own ResizeObserver + transform:scale loop). natW/natH is
// the content's natural (unscaled) pixel size; opts tunes padding, header
// height, and how far the content is allowed to shrink/grow.
function attachAutoScale(widgetId, widgetEl, contentEl, natW, natH, opts) {
  const { minScale = 0.5, maxScale = 1.5, padX = 16, padY = 16, headerH = 34 } = opts || {};
  function apply() {
    const bw = widgetEl.offsetWidth, bh = widgetEl.offsetHeight;
    if (!bw || !bh) return;
    const availW = bw - padX;
    const availH = bh - headerH - padY;
    const scale = Math.min(availW / natW, availH / natH);
    const clamped = Math.min(Math.max(scale, minScale), maxScale);
    contentEl.style.transform = `scale(${clamped.toFixed(4)})`;
  }
  requestAnimationFrame(apply);
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(apply);
    ro.observe(widgetEl);
    registerCleanup(widgetId, () => ro.disconnect());
  }
  return apply;
}
