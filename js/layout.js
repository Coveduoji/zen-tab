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
// Widget types whose rendered w:h cell ratio is locked. Value is width/height.
const ASPECT_LOCK = { pomodoro: 1, weather: 3/2, clock: 3/2 };
const COLS_MAX    = 20;
const GAP         = 36;
const CELL_TARGET = 60;
// Side margin ≈ 2 grid columns; must match #grid-outer's left/right padding.
const OUTER_PAD   = CELL_TARGET * 2;

// ── Cell geometry ─────────────────────────────────────────
// Read the grid box once and derive every metric from that single layout read.
function readGeom() {
  const outer = document.getElementById('grid-outer');
  const gw = Math.max(0, (outer ? outer.clientWidth : 0) - OUTER_PAD * 2);
  const vc = Math.max(1, Math.min(COLS_MAX, Math.floor((gw + GAP) / (CELL_TARGET + GAP))));
  const colW = (gw - GAP * (vc - 1)) / vc;
  return { gw, vc, colW, rowH: colW };
}

function visibleCols() {
  return readGeom().vc;
}

// Clamp only the widget's intrinsic size rules. Position is no longer stored:
// order is the array order and positions are derived by computeDenseLayout().
function clampSize(w, vc) {
  const cols = vc || readGeom().vc;
  const r = SIZE_RULES[w.type] || { minW:1, minH:1, maxW:cols, maxH:20 };
  w.w = Math.max(r.minW, Math.min(r.maxW, cols, w.w));
  w.h = Math.max(r.minH, Math.min(r.maxH, w.h));
  return w;
}

function itemWidth(cols, geom) {
  return cols * geom.colW + (cols - 1) * GAP;
}

function itemHeight(w, cols, geom) {
  const ratio = ASPECT_LOCK[w.type];
  if (ratio) return itemWidth(cols, geom) / ratio;
  const rows = Math.max(1, w.h);
  return rows * geom.rowH + (rows - 1) * GAP;
}

/**
 * Dense multi-column masonry / skyline layout.
 *
 * Items are processed in the array order (the only thing the user controls).
 * Each item takes the contiguous column range where its top edge can be
 * placed highest (lowest y); ties go to the leftmost range. It then updates
 * the skyline of the columns it spans. This fills holes left by shorter or
 * narrower widgets instead of leaving the row gaps of a shelf layout.
 *
 * Positions are a pure function of (order, sizes, column count, cell size),
 * so shrinking the window and restoring it returns every widget to exactly
 * the same place.
 *
 * Returns Map<widgetId, {x, y, w, h}>, with y/h in pixels.
 */
function computeDenseLayout(widgets, geom) {
  const vc = geom ? geom.vc : readGeom().vc;
  const bottoms = new Array(vc).fill(0);
  const out = new Map();

  for (const w of widgets) {
    const cols = Math.max(1, Math.min(w.w, vc));
    let bestX = 0;
    let bestY = Infinity;
    for (let x = 0; x <= vc - cols; x++) {
      let top = 0;
      for (let j = x; j < x + cols; j++) top = Math.max(top, bottoms[j]);
      // Strict improvement keeps the leftmost range on ties.
      if (top < bestY - 0.5) { bestY = top; bestX = x; }
    }
    if (bestY === Infinity) { bestX = 0; bestY = 0; }

    const h = itemHeight(w, cols, geom);
    out.set(w.id, { x: bestX, y: bestY, w: cols, h });
    for (let j = bestX; j < bestX + cols; j++) bottoms[j] = bestY + h + GAP;
  }
  return out;
}

// Pixel rectangle for a computed slot.
function wPx(w, pos, geom) {
  return {
    left: pos.x * (geom.colW + GAP),
    top: pos.y,
    width: itemWidth(pos.w, geom),
    height: pos.h,
  };
}

// ── Widget timer / cleanup registry ───────────────────────
const _widgetTimers = new Map();
const _widgetCleanups = new Map();

function registerTimer(widgetId, id) {
  if (!_widgetTimers.has(widgetId)) _widgetTimers.set(widgetId, new Set());
  _widgetTimers.get(widgetId).add(id);
  return id;
}

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
// widget" helper (used by clock/pomodoro/weather). natW/natH is the content's
// natural (unscaled) pixel size; opts tunes padding/header height/limits.
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
