/* ── OVERLAY DIVIDERS ──
   Dividers are line components, not GridStack items: they never occupy cells
   or push widgets around. Their endpoints live at grid-cell centers, can be
   dragged independently, and magnetically snap to other endpoints. Coincident
   perpendicular endpoints are joined with a rounded "water drop" corner. */
const DIVIDER_CORNER_PX = 12;
const DIVIDER_SNAP_PX = 0.55;    // magnet radius, as a fraction of cell pitch
const DIVIDER_NEAR_CELLS = 1.55; // fallback S-bridge radius in cells

function _dividerTypeOk(type) {
  return type === 'divider_h' || type === 'divider_v';
}

function _dividerIsH(type) {
  return type === 'divider_h';
}

function _dividerNorm(type, cfg) {
  const isH = _dividerIsH(type);
  cfg = cfg || {};
  let x1 = Number.isFinite(cfg.x1) ? Math.round(cfg.x1) : 0;
  let y1 = Number.isFinite(cfg.y1) ? Math.round(cfg.y1) : 0;
  let x2 = Number.isFinite(cfg.x2) ? Math.round(cfg.x2) : (isH ? x1 + 3 : x1);
  let y2 = Number.isFinite(cfg.y2) ? Math.round(cfg.y2) : (isH ? y1 : y1 + 3);
  x1 = Math.max(0, Math.min(COLS_MAX - 1, x1));
  x2 = Math.max(0, Math.min(COLS_MAX - 1, x2));
  y1 = Math.max(0, y1);
  y2 = Math.max(0, y2);
  if (isH) {
    y2 = y1;
    if (x2 <= x1) x2 = x1 + 1;
    if (x2 > COLS_MAX - 1) { x2 = COLS_MAX - 1; x1 = x2 - 1; }
  } else {
    x2 = x1;
    if (y2 <= y1) y2 = y1 + 1;
  }
  return { x1, y1, x2, y2 };
}

function _dividerEntry(id) {
  return state.widgets.find(w => w.id === id && _dividerTypeOk(w.type)) || null;
}

function _dividerDisplay(type, cfg, cols) {
  const isH = _dividerIsH(type);
  const c = _dividerNorm(type, cfg);
  if (isH) {
    if (cols < 2) return null;
    c.x1 = Math.min(c.x1, cols - 2);
    c.x2 = Math.max(c.x1 + 1, Math.min(c.x2, cols - 1));
    return c;
  }
  c.x1 = Math.min(c.x1, cols - 1);
  c.x2 = c.x1;
  return c;
}

function _dividerSeg(entry, pitch, cols) {
  const isH = _dividerIsH(entry.type);
  const c = _dividerDisplay(entry.type, entry.config, cols);
  if (!c) return null;
  if (isH) {
    return {
      id: entry.id, isH, cfg: c,
      a: { x: (c.x1 + 0.5) * pitch, y: (c.y1 + 0.5) * pitch },
      b: { x: (c.x2 + 0.5) * pitch, y: (c.y1 + 0.5) * pitch },
      outA: { x: -1, y: 0 }, outB: { x: 1, y: 0 },
      cellA: { x: c.x1, y: c.y1 }, cellB: { x: c.x2, y: c.y1 },
    };
  }
  return {
    id: entry.id, isH, cfg: c,
    a: { x: (c.x1 + 0.5) * pitch, y: (c.y1 + 0.5) * pitch },
    b: { x: (c.x1 + 0.5) * pitch, y: (c.y2 + 0.5) * pitch },
    outA: { x: 0, y: -1 }, outB: { x: 0, y: 1 },
    cellA: { x: c.x1, y: c.y1 }, cellB: { x: c.x1, y: c.y2 },
  };
}

function _dividerSegs() {
  const geom = readGeom();
  const pitch = geom.colW + GAP;
  const cols = geom.vc;
  const segs = [];
  if (pitch > 0) {
    for (const w of state.widgets) {
      if (!_dividerTypeOk(w.type)) continue;
      const s = _dividerSeg(w, pitch, cols);
      if (s) segs.push(s);
    }
  }
  return { segs, pitch, cols };
}

// Registry entries exist for the marketplace/command palette even though
// dividers are overlay components rather than mounted grid items.
reg({
  type: 'divider_h',
  get name() { return t('w_divider_h'); },
  get desc() { return t('w_divider_h_d'); },
  icon: '━',
  cat: 'basic',
  render() {},
});
reg({
  type: 'divider_v',
  get name() { return t('w_divider_v'); },
  get desc() { return t('w_divider_v_d'); },
  icon: '┃',
  cat: 'basic',
  render() {},
});

// ── Add / remove ──────────────────────────────────────────
function addOverlayDivider(type) {
  if (!_dividerTypeOk(type)) return;
  const cols = Math.max(1, readGeom().vc);
  const isH = _dividerIsH(type);
  if (isH && cols < 2) return;

  let baseRow = 0;
  for (const w of state.widgets) {
    const node = document.querySelector(`.grid-stack-item[data-id="${w.id}"]`)?.gridstackNode;
    if (node) baseRow = Math.max(baseRow, node.y + node.h);
  }
  const cfg = isH
    ? { x1: 0, y1: baseRow, x2: Math.min(3, cols - 1), y2: baseRow }
    : { x1: 0, y1: baseRow, x2: 0, y2: baseRow + 3 };
  state.widgets.push({ id: genId(type), type, config: _dividerNorm(type, cfg) });
  saveState();
  renderDividers();
  updateEmptyHint();
  if (!editMode && typeof enterEditMode === 'function') enterEditMode();
  toast(t(isH ? 'w_divider_h' : 'w_divider_v') + (lang === 'zh' ? ' 已添加' : ' added'), 'ok');
}

function removeOverlayDivider(id) {
  const before = state.widgets.length;
  state.widgets = state.widgets.filter(w => !(w.id === id && _dividerTypeOk(w.type)));
  if (state.widgets.length === before) return;
  saveState();
  renderDividers();
  updateEmptyHint();
  toast(t('widget_removed'), '');
}

// ── Pointer interactions ──────────────────────────────────
let _dividerDrag = null;

function _dividerDragStart(e, cursor) {
  document.body.style.setProperty('--divider-cursor', cursor);
  document.body.classList.add('divider-dragging');
  document.addEventListener('pointermove', _dividerDragMove);
  document.addEventListener('pointerup', _dividerDragEnd, { once: true });
  document.addEventListener('pointercancel', _dividerDragEnd, { once: true });
  e.preventDefault();
  e.stopPropagation();
}

function _dividerDragEnd() {
  document.removeEventListener('pointermove', _dividerDragMove);
  document.removeEventListener('pointerup', _dividerDragEnd);
  document.removeEventListener('pointercancel', _dividerDragEnd);
  document.body.classList.remove('divider-dragging');
  document.body.style.removeProperty('--divider-cursor');
  const d = _dividerDrag;
  _dividerDrag = null;
  if (d && d.changed) saveState();
  renderDividers();
}

function _dividerPointerCell(ev) {
  const canvas = document.getElementById('grid-canvas');
  const { pitch, cols } = _dividerSegs();
  if (!canvas || !(pitch > 0)) return null;
  const r = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(cols - 1, Math.floor((ev.clientX - r.left) / pitch))),
    y: Math.max(0, Math.floor((ev.clientY - r.top) / pitch)),
    px: ev.clientX - r.left,
    py: ev.clientY - r.top,
    pitch, cols,
  };
}

// Snap an endpoint to another divider's endpoint in the same row/column when
// the pointer is close. Overlay lines may share the exact same cell center, so
// this produces a true corner rather than a bridge.
function _dividerSnapEndpoint(excludeId, isH, fixed, pointer) {
  if (!pointer) return null;
  let best = null;
  let bestD = Infinity;
  const limit = pointer.pitch * DIVIDER_SNAP_PX;
  for (const w of state.widgets) {
    if (w.id === excludeId || !_dividerTypeOk(w.type)) continue;
    const c = _dividerNorm(w.type, w.config);
    const pts = _dividerIsH(w.type)
      ? [{ x: c.x1, y: c.y1 }, { x: c.x2, y: c.y1 }]
      : [{ x: c.x1, y: c.y1 }, { x: c.x1, y: c.y2 }];
    for (const p of pts) {
      if (isH && p.y !== fixed) continue;
      if (!isH && p.x !== fixed) continue;
      const px = (p.x + 0.5) * pointer.pitch;
      const py = (p.y + 0.5) * pointer.pitch;
      const d = Math.hypot(px - pointer.px, py - pointer.py);
      if (d <= limit && d < bestD) { best = p; bestD = d; }
    }
  }
  return best;
}

function startDividerEndDrag(id, end, down) {
  const entry = _dividerEntry(id);
  if (!entry) return;
  const cell = _dividerPointerCell(down);
  if (!cell) return;
  const isH = _dividerIsH(entry.type);
  _dividerDrag = { kind: 'end', id, end, changed: false };
  _dividerDragStart(down, isH ? 'ew-resize' : 'ns-resize');
}

function startDividerMove(id, down) {
  const entry = _dividerEntry(id);
  if (!entry) return;
  const cell = _dividerPointerCell(down);
  if (!cell) return;
  _dividerDrag = {
    kind: 'move', id, changed: false,
    startX: down.clientX, startY: down.clientY,
    cfg: _dividerNorm(entry.type, entry.config),
    isH: _dividerIsH(entry.type),
  };
  _dividerDragStart(down, 'move');
}

function _dividerDragMove(ev) {
  const d = _dividerDrag;
  if (!d) return;
  ev.preventDefault();
  const entry = _dividerEntry(d.id);
  if (!entry) return;
  const cell = _dividerPointerCell(ev);
  if (!cell) return;
  const isH = _dividerIsH(entry.type);
  const cfg = _dividerNorm(entry.type, entry.config);

  if (d.kind === 'move') {
    const dx = Math.round((ev.clientX - d.startX) / cell.pitch);
    const dy = Math.round((ev.clientY - d.startY) / cell.pitch);
    const base = d.cfg;
    if (d.isH) {
      const span = base.x2 - base.x1;
      const x1 = Math.max(0, Math.min(cell.cols - 1 - span, base.x1 + dx));
      const y = Math.max(0, base.y1 + dy);
      entry.config = _dividerNorm(entry.type, { x1, y1: y, x2: x1 + span, y2: y });
    } else {
      const span = base.y2 - base.y1;
      const x = Math.max(0, Math.min(cell.cols - 1, base.x1 + dx));
      const y1 = Math.max(0, base.y1 + dy);
      entry.config = _dividerNorm(entry.type, { x1: x, y1, x2: x, y2: y1 + span });
    }
    d.changed = true;
    renderDividers();
    return;
  }

  // Endpoint drag
  const pointer = { px: cell.px, py: cell.py, pitch: cell.pitch };
  const snap = _dividerSnapEndpoint(entry.id, isH, isH ? cfg.y1 : cfg.x1, pointer);
  const next = { ...cfg };
  if (isH) {
    const x = snap ? snap.x : cell.x;
    if (d.end === 'b') next.x2 = Math.max(cfg.x1 + 1, Math.min(cell.cols - 1, x));
    else next.x1 = Math.min(cfg.x2 - 1, Math.max(0, x));
  } else {
    const y = snap ? snap.y : cell.y;
    if (d.end === 'b') next.y2 = Math.max(cfg.y1 + 1, y);
    else next.y1 = Math.min(cfg.y2 - 1, Math.max(0, y));
  }
  entry.config = _dividerNorm(entry.type, next);
  d.changed = true;
  renderDividers();
}

function initDividerLayer() {
  const svg = document.getElementById('divider-layer');
  if (!svg || svg._dividerWired) return;
  svg._dividerWired = true;
  // Normalize any persisted divider configs once the state exists.
  for (const w of state.widgets) {
    if (_dividerTypeOk(w.type)) w.config = _dividerNorm(w.type, w.config);
  }
  svg.addEventListener('pointerdown', e => {
    if (!editMode) return;
    const rem = e.target.closest?.('.divider-svg-remove');
    if (rem) { removeOverlayDivider(rem.dataset.id); return; }
    const handle = e.target.closest?.('.divider-svg-handle');
    if (handle) { startDividerEndDrag(handle.dataset.id, handle.dataset.end, e); return; }
    const hit = e.target.closest?.('.divider-svg-hit');
    if (hit) { startDividerMove(hit.dataset.id, e); return; }
  });
}

// ── SVG rendering ─────────────────────────────────────────
function renderDividers() {
  const canvas = document.getElementById('grid-canvas');
  const svg = document.getElementById('divider-layer');
  if (!canvas || !svg) return;
  const { segs, pitch, cols } = _dividerSegs();
  if (!(pitch > 0) || !cols) {
    canvas.style.minHeight = '';
    svg.replaceChildren();
    return;
  }

  // Extend the scroll area so lines below the widgets (the default placement)
  // are visible. Use widget bottoms, not offsetHeight, so deleting a divider
  // can shrink the area again.
  let contentBottom = 0;
  for (const w of state.widgets) {
    const node = document.querySelector(`.grid-stack-item[data-id="${w.id}"]`)?.gridstackNode;
    if (node) contentBottom = Math.max(contentBottom, (node.y + node.h) * pitch);
  }
  let lineBottom = 0;
  for (const s of segs) lineBottom = Math.max(lineBottom, s.a.y, s.b.y);
  if (segs.length) {
    const need = Math.max(contentBottom + pitch * 0.5, lineBottom + pitch * 0.6);
    canvas.style.minHeight = `${Math.ceil(need)}px`;
  } else {
    canvas.style.minHeight = '';
  }
  const width = canvas.offsetWidth;
  const height = Math.max(canvas.offsetHeight, lineBottom + pitch * 0.6, 1);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.replaceChildren();
  if (!segs.length) return;

  const NS = 'http://www.w3.org/2000/svg';
  const frag = document.createDocumentFragment();
  const segTrims = new Map(); // seg id -> {a,b}
  const cornerPaths = [];
  const used = new Set();

  const reps = [];
  for (const s of segs) {
    segTrims.set(s.id, { a: 0, b: 0 });
    reps.push({ s, end: 'a', p: s.a, dir: s.outA, cell: s.cellA });
    reps.push({ s, end: 'b', p: s.b, dir: s.outB, cell: s.cellB });
  }

  const segLen = s => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);

  // Coincident perpendicular endpoints -> trimmed rounded elbow.
  const byCell = new Map();
  for (let i = 0; i < reps.length; i++) {
    const r = reps[i];
    const key = `${r.cell.x},${r.cell.y}`;
    if (!byCell.has(key)) byCell.set(key, []);
    byCell.get(key).push(i);
  }
  for (const ids of byCell.values()) {
    if (ids.length < 2) continue;
    for (let xi = 0; xi < ids.length; xi++) {
      for (let yi = xi + 1; yi < ids.length; yi++) {
        const ia = ids[xi], ib = ids[yi];
        if (used.has(ia) || used.has(ib)) continue;
        const a = reps[ia], b = reps[ib];
        if (a.s.id === b.s.id || a.s.isH === b.s.isH) continue;
        const r = Math.min(DIVIDER_CORNER_PX, pitch * 0.18, segLen(a.s) * 0.35, segLen(b.s) * 0.35);
        if (!(r > 1)) continue;
        used.add(ia); used.add(ib);
        const P = a.p;
        const ta = segTrims.get(a.s.id);
        const tb = segTrims.get(b.s.id);
        if (a.end === 'a') ta.a = Math.max(ta.a, r); else ta.b = Math.max(ta.b, r);
        if (b.end === 'a') tb.a = Math.max(tb.a, r); else tb.b = Math.max(tb.b, r);
        const p1 = { x: P.x - a.dir.x * r, y: P.y - a.dir.y * r };
        const p2 = { x: P.x - b.dir.x * r, y: P.y - b.dir.y * r };
        cornerPaths.push(`M ${p1.x} ${p1.y} Q ${P.x} ${P.y} ${p2.x} ${p2.y}`);
      }
    }
  }

  // Nearby but unshared perpendicular endpoints -> smooth S bridge (covers
  // diagonal endpoints that have not been snapped into a shared cell).
  const maxDist = pitch * DIVIDER_NEAR_CELLS;
  for (let i = 0; i < reps.length; i++) {
    if (used.has(i)) continue;
    const a = reps[i];
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < reps.length; j++) {
      if (i === j || used.has(j)) continue;
      const b = reps[j];
      if (a.s.id === b.s.id || a.s.isH === b.s.isH) continue;
      const d = Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y);
      if (d < 1 || d > maxDist || d >= bestD) continue;
      best = j;
      bestD = d;
    }
    if (best < 0) continue;
    used.add(i); used.add(best);
    const b = reps[best];
    const k = Math.min(bestD * 0.5, pitch * 0.8);
    const c1 = { x: a.p.x + a.dir.x * k, y: a.p.y + a.dir.y * k };
    const c2 = { x: b.p.x + b.dir.x * k, y: b.p.y + b.dir.y * k };
    cornerPaths.push(`M ${a.p.x} ${a.p.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.p.x} ${b.p.y}`);
  }

  for (const s of segs) {
    const t = segTrims.get(s.id);
    const dx = Math.sign(s.b.x - s.a.x);
    const dy = Math.sign(s.b.y - s.a.y);
    const a = { x: s.a.x + dx * t.a, y: s.a.y + dy * t.a };
    const b = { x: s.b.x - dx * t.b, y: s.b.y - dy * t.b };
    if (Math.abs(b.x - a.x) + Math.abs(b.y - a.y) < 0.5) continue;
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('class', 'divider-line');
    p.setAttribute('d', `M ${a.x} ${a.y} L ${b.x} ${b.y}`);
    frag.appendChild(p);
  }
  for (const d of cornerPaths) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('class', 'divider-corner');
    p.setAttribute('d', d);
    frag.appendChild(p);
  }

  if (editMode) {
    for (const s of segs) {
      const hit = document.createElementNS(NS, 'path');
      hit.setAttribute('class', 'divider-svg-hit');
      hit.setAttribute('data-id', s.id);
      hit.setAttribute('d', `M ${s.a.x} ${s.a.y} L ${s.b.x} ${s.b.y}`);
      frag.appendChild(hit);

      const mkHandle = (end, pt) => {
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('class', 'divider-svg-handle');
        c.setAttribute('data-id', s.id);
        c.setAttribute('data-end', end);
        c.setAttribute('data-orient', s.isH ? 'h' : 'v');
        c.setAttribute('cx', pt.x);
        c.setAttribute('cy', pt.y);
        c.setAttribute('r', '6');
        return c;
      };
      frag.appendChild(mkHandle('a', s.a));
      frag.appendChild(mkHandle('b', s.b));

      const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'divider-svg-remove');
      g.setAttribute('data-id', s.id);
      g.setAttribute('transform', `translate(${mid.x} ${mid.y})`);
      const circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('r', '9');
      const x = document.createElementNS(NS, 'path');
      x.setAttribute('d', 'M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5');
      g.appendChild(circle);
      g.appendChild(x);
      frag.appendChild(g);
    }
  }

  svg.appendChild(frag);
}
