'use strict';
// ── Grid constants ────────────────────────────────────────
const SIZE_RULES = {
  clock:    { minW:2, minH:2, maxW:4, maxH:4, defW:3, defH:3 },
  link:     { minW:1, minH:1, maxW:4, maxH:4, defW:1, defH:1 },
  notes:    { minW:2, minH:2, maxW:6, maxH:6, defW:4, defH:4 },
  todo:     { minW:3, minH:3, maxW:8, maxH:7, defW:5, defH:5 },
  weather:  { minW:2, minH:2, maxW:4, maxH:4, defW:2, defH:3 },
  gtrend:   { minW:3, minH:3, maxW:6, maxH:8, defW:4, defH:5 },
  pomodoro: { minW:2, minH:2, maxW:5, maxH:5, defW:3, defH:3 },
  embed:    { minW:3, minH:3, maxW:8, maxH:8, defW:5, defH:5 },
};
const COLS_MAX    = 20;
const GAP         = 28;
const CELL_TARGET = 76;
const COLS        = COLS_MAX;

// ── Layout cache — invalidated on resize ──────────────────
let _cachedGw = 0, _cachedVc = 0, _cachedCw = 0;

function _updateLayoutCache() {
  const el = document.getElementById('grid-outer');
  if (!el) return;
  _cachedGw = el.clientWidth - 200;
  _cachedVc = Math.max(1, Math.min(COLS_MAX, Math.floor((_cachedGw + GAP) / (CELL_TARGET + GAP))));
  _cachedCw = (_cachedGw - GAP * (_cachedVc - 1)) / _cachedVc;
}

function invalidateLayoutCache() { _cachedGw = 0; }

// ── Cell geometry ─────────────────────────────────────────
function visibleCols() { if (!_cachedGw) _updateLayoutCache(); return _cachedVc; }
function gw()          { if (!_cachedGw) _updateLayoutCache(); return _cachedGw; }
function cw()          { if (!_cachedGw) _updateLayoutCache(); return _cachedCw; }
function rowH()        { return cw(); }
function ry(row)       { return row * (rowH() + GAP); }

// Direct pixel position from state coords (used during drag/resize)
function wPx(w) {
  const colW = cw(), vc = visibleCols();
  const rw     = Math.min(w.w, vc);
  const width  = rw * colW + (rw - 1) * GAP;
  const height = (w.type === 'link' || w.type === 'pomodoro') ? width : w.h * rowH() + (w.h - 1) * GAP;
  return { left: w.x * (colW + GAP), top: ry(w.y), width, height };
}

// Pixel position with responsive override (used only for renderAll/positionAll)
function wPxResponsive(w, overrides) {
  const colW = cw(), vc = visibleCols();
  const ov   = overrides && overrides[w.id];
  const rw   = ov ? ov.w : Math.min(w.w, vc);
  const rx   = ov ? ov.x : Math.min(w.x, vc - rw);
  const ry_  = ov ? ov.y : w.y;
  const width  = rw * colW + (rw - 1) * GAP;
  const height = (w.type === 'link' || w.type === 'pomodoro') ? width : w.h * rowH() + (w.h - 1) * GAP;
  return { left: rx * (colW + GAP), top: ry_ * (rowH() + GAP), width, height };
}

// Window-shrink reflow: collision-free layout into vc columns (render only, no state mutation)
function computeResponsiveLayout() {
  const vc = visibleCols();
  if (vc >= COLS_MAX) return null;

  const sorted = [...state.widgets].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
  const MAX_ROWS = 200;
  const grid = new Uint8Array(MAX_ROWS * vc);

  function isFree(x, y, w, h) {
    for (let r = y; r < y + h; r++) {
      if (r >= MAX_ROWS) return false;
      for (let c = x; c < x + w; c++) if (grid[r * vc + c]) return false;
    }
    return true;
  }
  function occupy(x, y, w, h) {
    for (let r = y; r < y + h && r < MAX_ROWS; r++)
      for (let c = x; c < x + w; c++) grid[r * vc + c] = 1;
  }

  const overrides = {};
  for (const w of sorted) {
    const rw = Math.min(w.w, vc);
    let placed = false;
    for (let row = 0; !placed; row++) {
      for (let col = 0; col <= vc - rw; col++) {
        if (isFree(col, row, rw, w.h)) {
          overrides[w.id] = { x: col, y: row, w: rw };
          occupy(col, row, rw, w.h);
          placed = true;
          break;
        }
      }
    }
  }
  return overrides;
}

// ── Constraint enforcement ────────────────────────────────
function clamp(w) {
  const r = SIZE_RULES[w.type] || { minW:1, minH:1, maxW:COLS, maxH:20 };
  w.w = Math.max(r.minW, Math.min(r.maxW, Math.min(COLS, w.w)));
  w.h = Math.max(r.minH, Math.min(r.maxH, w.h));
  w.x = Math.max(0, Math.min(COLS - w.w, w.x));
  w.y = Math.max(0, w.y);
  return w;
}

function normalizeToVc() {
  const vc = visibleCols();
  state.widgets.forEach(w => {
    w.w = Math.min(w.w, vc);
    w.x = Math.min(w.x, vc - w.w);
  });
}

// ── Collision detection ───────────────────────────────────
function collides(a, b) {
  if (a.id === b.id) return false;
  return !(a.x+a.w <= b.x || b.x+b.w <= a.x || a.y+a.h <= b.y || b.y+b.h <= a.y);
}

// ── Push collision: right → left → down, never up ────────
// Mutates hit positions in-place. Used after every drop/resize.
function pushDown(mover, widgets, depth = 0) {
  if (depth > 20) return;
  const vc = visibleCols();
  for (const hit of widgets) {
    if (hit.id === mover.id || !collides(mover, hit)) continue;
    // Try right, then left, then below
    const tries = [
      { x: mover.x + mover.w, y: hit.y },
      { x: mover.x - hit.w,   y: hit.y },
      { x: hit.x,              y: mover.y + mover.h },
    ];
    let placed = false;
    for (const t of tries) {
      if (t.x < 0 || t.x + hit.w > vc) continue;
      const candidate = { ...hit, x: t.x, y: t.y };
      if (!widgets.some(w => w.id !== hit.id && w.id !== mover.id && collides(candidate, w))) {
        hit.x = t.x; hit.y = t.y; placed = true; break;
      }
    }
    if (!placed) hit.y = mover.y + mover.h;
    pushDown(hit, widgets, depth + 1);
  }
}

// ── Compact: pull every widget up as far as possible ─────
function compact(widgets) {
  const sorted = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed = [];
  for (const w of sorted) {
    for (let y = 0; y <= w.y; y++) {
      if (!placed.some(p => collides({ ...w, y }, p))) { w.y = y; break; }
    }
    placed.push(w);
  }
}

// ── Find first free slot ──────────────────────────────────
function findFreeSlot(ww, wh, widgets) {
  for (let y = 0; y < 40; y++)
    for (let x = 0; x <= COLS - ww; x++)
      if (!widgets.some(w => collides({ id:'__new__', x, y, w:ww, h:wh }, w))) return { x, y };
  return { x: 0, y: 0 };
}

// ── Full tidy: re-pack from top-left ─────────────────────
function tidyLayout(widgets) {
  const sorted = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed = [];
  for (const w of sorted) {
    outer: for (let y = 0; y < 40; y++)
      for (let x = 0; x <= COLS - w.w; x++)
        if (!placed.some(p => collides({ id:w.id, x, y, w:w.w, h:w.h }, p))) {
          w.x = x; w.y = y; placed.push({ ...w }); break outer;
        }
  }
}

// ── Widget timer registry ─────────────────────────────────
const _widgetTimers = new Map();

function registerTimer(widgetId, id) {
  if (!_widgetTimers.has(widgetId)) _widgetTimers.set(widgetId, new Set());
  _widgetTimers.get(widgetId).add(id);
  return id;
}

function cleanupWidget(widgetId) {
  const ids = _widgetTimers.get(widgetId);
  if (ids) { ids.forEach(id => { clearInterval(id); cancelAnimationFrame(id); }); _widgetTimers.delete(widgetId); }
  const el = document.querySelector(`.widget[data-id="${widgetId}"]`);
  if (el?._roDisconnect) { el._roDisconnect(); delete el._roDisconnect; }
}
