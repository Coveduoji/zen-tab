'use strict';
// ── Widget size rules ────────────────────────────────────
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
const COLS = 12; // Gridstack default column count

// ── Constraint clamp ──────────────────────────────────────
function clamp(w) {
  const r = SIZE_RULES[w.type] || { minW:1, minH:1, maxW:COLS, maxH:20 };
  w.w = Math.max(r.minW, Math.min(r.maxW, Math.min(COLS, w.w)));
  w.h = Math.max(r.minH, Math.min(r.maxH, w.h));
  w.x = Math.max(0, Math.min(COLS - w.w, w.x));
  w.y = Math.max(0, w.y);
  return w;
}

// ── Collision (used outside Gridstack for slot finding) ───
function collides(a, b) {
  if (a.id === b.id) return false;
  return !(a.x+a.w <= b.x || b.x+b.w <= a.x || a.y+a.h <= b.y || b.y+b.h <= a.y);
}

function findFreeSlot(ww, wh, widgets) {
  for (let y = 0; y < 40; y++)
    for (let x = 0; x <= COLS - ww; x++)
      if (!widgets.some(w => collides({ id:'__new__', x, y, w:ww, h:wh }, w))) return { x, y };
  return { x: 0, y: 0 };
}

function tidyLayout(widgets) {
  const sorted = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed = [];
  for (const w of sorted)
    outer: for (let y = 0; y < 40; y++)
      for (let x = 0; x <= COLS - w.w; x++)
        if (!placed.some(p => collides({ id:w.id, x, y, w:w.w, h:w.h }, p))) {
          w.x = x; w.y = y; placed.push({ ...w }); break outer;
        }
}

function compact(widgets) {
  // Used for initial load and post-delete cleanup
  const sorted = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed = [];
  for (const w of sorted) {
    for (let y = 0; y <= w.y; y++) {
      if (!placed.some(p => collides({ ...w, y }, p))) { w.y = y; break; }
    }
    placed.push(w);
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
  const el = document.querySelector(`.grid-stack-item[gs-id="${widgetId}"]`);
  if (el?._roDisconnect) { el._roDisconnect(); delete el._roDisconnect; }
}
