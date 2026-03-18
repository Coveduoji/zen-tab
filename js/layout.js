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
const GAP         = 8;
const CELL_TARGET = 60;
const COLS        = COLS_MAX;

// ── Cell geometry ─────────────────────────────────────────
function visibleCols() {
  const w = document.getElementById('grid-outer').clientWidth - 48;
  const fit = Math.floor((w + GAP) / (CELL_TARGET + GAP));
  return Math.max(1, Math.min(COLS_MAX, fit));
}
function gw()      { return document.getElementById('grid-outer').clientWidth - 48; }
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
  const height  = (w.type === 'link' || w.type === 'pomodoro') ? width : w.h * rowH() + (w.h - 1) * GAP;
  return { left: w.x * (colW + GAP), top: ry(w.y), width, height };
}

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

function computeResponsiveLayout() { return null; }

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
    const rw = Math.min(w.w, vc);
    w.w = rw;
    w.x = Math.min(w.x, vc - rw);
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

function findFreeSlot(ww, wh, widgets) {
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x <= COLS - ww; x++) {
      const rect = { id: '__new__', x, y, w: ww, h: wh };
      if (!widgets.some(w => collides(rect, w))) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

function tidyLayout(widgets) {
  const sorted = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed = [];
  for (const w of sorted) {
    let bestX = 0, bestY = 0;
    outer: for (let y = 0; y < 40; y++) {
      for (let x = 0; x <= COLS - w.w; x++) {
        const rect = { id: w.id, x, y, w: w.w, h: w.h };
        if (!placed.some(p => collides(rect, p))) { bestX = x; bestY = y; break outer; }
      }
    }
    w.x = bestX; w.y = bestY;
    placed.push({ ...w });
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
  if (ids) {
    ids.forEach(id => { clearInterval(id); cancelAnimationFrame(id); });
    _widgetTimers.delete(widgetId);
  }
  const el = document.querySelector(`.widget[data-id="${widgetId}"]`);
  if (el?._roDisconnect) { el._roDisconnect(); delete el._roDisconnect; }
}
