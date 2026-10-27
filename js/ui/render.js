/* ═══════════════════════════════════════════════════════
   WIDGET INSTANCE MANAGER — GridStack integration
   ═══════════════════════════════════════════════════════ */

var grid = null;          // GridStack instance
var gridCols = 0;         // current column count
var _gridSyncing = false; // ignore change events while loading/column switching
let _captureTimer = 0;

function saveWCfg(id, cfg, useDebounce = false) {
  const w = state.widgets.find(w=>w.id===id);
  if (w) {
    w.config = cfg;
    if (useDebounce) debouncedSaveState();
    else saveState();
  }
}

// Interactive targets own their pointer events; GridStack's draggable.cancel
// also lists these so dragging starts from the title/blank card area.
const NO_DRAG_SELECTOR = 'input, textarea, button, select, a, [contenteditable], [draggable="true"], .rh, .cal-task-item, .cal-add-row, .ui-resizable-handle';

function setCardDragged(item, val) {
  const card = item && item.querySelector && item.querySelector('.widget');
  if (card) card._wasDragged = val;
}

function makeWidget(wdata) {
  const def = REG[wdata.type];
  if (!def) return null;

  const item = document.createElement('div');
  item.className = 'grid-stack-item';
  item.dataset.id = wdata.id;
  item.dataset.type = wdata.type;

  const content = document.createElement('div');
  content.className = 'grid-stack-item-content';

  const el = document.createElement('div');
  el.className = 'widget enter' + (typeof pureMode !== 'undefined' && pureMode ? ' pure-hidden' : '');
  el.dataset.id = wdata.id;
  el.dataset.type = wdata.type;

  const clearEnter = () => el.classList.remove('enter');
  el.addEventListener('animationend', clearEnter, { once: true });
  setTimeout(clearEnter, 600);

  const isLink = wdata.type === 'link';
  const titleText = isLink ? (wdata.config.name || def.name) : def.name;
  const wR = 28; const wC = 2*Math.PI*wR;
  const delLabel = t('del_btn');

  el.innerHTML = `
    <button class="w-delete" type="button" title="${esc(delLabel)}" aria-label="${esc(delLabel)}">×</button>
    ${isLink
      ? ''
      : `<div class="w-header">
      <div class="w-title"><span class="ico">${def.icon}</span><span>${titleText}</span></div>
      <div class="w-controls" style="display:flex;gap:3px;opacity:0;transition:opacity var(--t)"></div>
    </div>`}
    <div class="w-body"></div>
    <div class="w-lp-ring" id="wlpr-${wdata.id}">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle class="wlp-track" cx="32" cy="32" r="${wR}" stroke-width="3"/>
        <circle class="wlp-fill" cx="32" cy="32" r="${wR}" stroke-width="3"
          stroke-dasharray="${wC.toFixed(1)}" stroke-dashoffset="${wC.toFixed(1)}" id="wlpf-${wdata.id}"/>
      </svg>
    </div>`;
  content.appendChild(el);
  item.appendChild(content);

  el.addEventListener('mouseenter', () => { if (!editMode) el.querySelector('.w-controls')?.style.setProperty('opacity','1'); });
  el.addEventListener('mouseleave', () => { el.querySelector('.w-controls')?.style.setProperty('opacity','0'); });
  el.addEventListener('contextmenu', e => openCtxMenu(e, wdata.id));

  el.querySelector('.w-delete')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    confirm2(t('del_confirm_t'), t('del_confirm_s'), t('del_btn'), ok => {
      if (!ok) return;
      removeWidget(wdata.id);
      toast(t('widget_removed'), '');
    });
  });

  const body = el.querySelector('.w-body');
  try {
    def.render(body, wdata.config, wdata.id, wdata);
  } catch(e) {
    console.error('[Widget render error]', 'id:', wdata.id, 'type:', wdata.type, '\nError:', e);
    body.innerHTML =
      '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'height:100%;gap:8px;padding:12px;text-align:center">' +
      '<div style="font-size:1.4rem;opacity:.5">⚠️</div>' +
      '<div style="font-size:.75rem;color:var(--text-muted);font-weight:600">Render error</div>' +
      '<div style="font-family:var(--mono);font-size:.62rem;color:var(--text-dim);' +
      'word-break:break-all;max-height:60px;overflow:hidden">' +
      (e && e.message ? e.message.slice(0, 120) : 'Unknown error') +
      '</div></div>';
  }

  // Link widgets navigate on a clean click; GridStack drags the item on move.
  if (isLink) {
    el.addEventListener('click', e => {
      if (editMode || el._wasDragged) return;
      if (e.target.closest(NO_DRAG_SELECTOR)) return;
      window.open(wdata.config.url, '_blank', 'noopener,noreferrer');
    });
  }

  /* ── Long press (widget) → edit mode. A normal click shows no ring. ── */
  const WLP_DELAY = 180;
  const WLP_DUR = 500;
  let wlpTimer = null, wlpDelayTimer = null, wlpStart = null, wlpX = 0, wlpY = 0;
  const ringEl = el.querySelector('.w-lp-ring');
  const fillEl = el.querySelector('.wlp-fill');
  const WC_VAL = 2 * Math.PI * 28;

  function stopWLP() {
    clearTimeout(wlpDelayTimer); wlpDelayTimer = null;
    if (wlpTimer) { cancelAnimationFrame(wlpTimer); wlpTimer = null; }
    if (ringEl) { ringEl.style.display='none'; if (fillEl) fillEl.style.opacity='0'; }
    wlpStart = null;
  }

  function startWLP(e) {
    if (editMode || e.button !== 0) return;
    if (e.target.closest(NO_DRAG_SELECTOR)) return;
    wlpX = e.clientX; wlpY = e.clientY;
    clearTimeout(wlpDelayTimer);
    wlpDelayTimer = setTimeout(() => {
      wlpDelayTimer = null;
      if (editMode) return;
      wlpStart = null;
      if (ringEl) { ringEl.style.display='block'; fillEl.style.opacity='1'; fillEl.style.strokeDashoffset=WC_VAL; }
      function frame(ts) {
        if (!wlpStart) wlpStart = ts;
        const pct = Math.min(1, (ts - wlpStart) / WLP_DUR);
        if (fillEl) fillEl.style.strokeDashoffset = WC_VAL * (1 - pct);
        if (pct < 1 && wlpTimer) wlpTimer = requestAnimationFrame(frame);
        else if (pct >= 1) { stopWLP(); enterEditMode(); }
      }
      wlpTimer = requestAnimationFrame(frame);
    }, WLP_DELAY);
  }

  el.addEventListener('pointerdown', startWLP);
  el.addEventListener('pointerup', stopWLP);
  el.addEventListener('pointerleave', stopWLP);
  el.addEventListener('pointermove', e => {
    if ((wlpDelayTimer || wlpTimer) &&
        (Math.abs(e.clientX-wlpX) + Math.abs(e.clientY-wlpY) > 5)) stopWLP();
  });
  el._unbindLongPress = stopWLP;

  return item;
}

// ── GridStack setup ───────────────────────────────────────
function initGrid() {
  const canvas = document.getElementById('grid-canvas');
  gridCols = readGeom().vc;
  grid = GridStack.init({
    column: gridCols,
    cellHeight: 'auto',
    margin: GAP / 2,
    mode: 'top',                 // compact upward, fill gaps
    auto: false,                 // we add items ourselves
    disableDrag: false,          // drag works in normal mode
    disableResize: !editMode,    // resize handles only in edit mode
    draggable: {
      handle: '.grid-stack-item-content',
      cancel: 'input,textarea,button,select,option,a,[contenteditable],[draggable="true"],.cal-task-item,.cal-add-row,.rh,.ui-resizable-handle,.w-delete',
    },
    resizable: { handles: 'se', autoHide: false },
    animate: true,
  }, canvas);

  grid.on('change', () => scheduleCapture());
  grid.on('dragstart', (_e, el) => setCardDragged(el, true));
  grid.on('dragstop', (_e, el) => {
    setTimeout(() => setCardDragged(el, false), 300);
    // Do not call compact('compact') here: it re-sorts empty slots and can
    // undo the drop. GridStack's 'top' mode already lifts items upward.
    scheduleCapture();
  });
  grid.on('resizestop', (_e, el) => {
    // Re-apply the icon-widget aspect lock after a free resize.
    const type = el.dataset.type;
    const ratio = ASPECT_LOCK[type];
    const node = el.gridstackNode;
    if (ratio && node) {
      const rules = SIZE_RULES[type] || {};
      const h = Math.max(rules.minH || 1, Math.min(rules.maxH || 20, Math.round(node.w / ratio)));
      if (h !== node.h) {
        _gridSyncing = true;
        grid.update(el, { h });
        _gridSyncing = false;
      }
    }
    scheduleCapture();
  });
  grid.on('added', () => { scheduleCapture(); updateEmptyHint(); });
  grid.on('removed', () => { scheduleCapture(); updateEmptyHint(); });
}

function scheduleCapture() {
  clearTimeout(_captureTimer);
  _captureTimer = setTimeout(captureLayout, 120);
}

// Persist the layout for the current column count, and keep the widget array
// order aligned with the visual order so a rollback to the order-based branch
// still has a sensible order.
function captureLayout() {
  if (!grid || _gridSyncing) return;
  const vc = gridCols;
  const nodes = grid.save(false);
  const map = {};
  for (const n of nodes) {
    const id = n.id || (n.el && n.el.dataset && n.el.dataset.id);
    if (!id) continue;
    map[id] = { x: n.x, y: n.y, w: n.w, h: n.h };
    const w = state.widgets.find(w => w.id === id);
    if (w) { w.w = n.w; w.h = n.h; }
  }
  state.gridLayouts[vc] = map;
  state.widgets.sort((a, b) => {
    const ma = map[a.id], mb = map[b.id];
    if (!ma || !mb) return 0;
    return (ma.y - mb.y) || (ma.x - mb.x);
  });
  debouncedSaveState();
  updateEmptyHint();
}

function applyLayout(map) {
  if (!grid || !map) return;
  const items = Object.entries(map).map(([id, pos]) => ({
    id, x: pos.x, y: pos.y, w: pos.w, h: pos.h,
  }));
  // Atomic load (no add/remove) preserves the saved column layout exactly.
  grid.load(items, false);
}

function addWidget(wdata) {
  if (!grid) initGrid();
  const vc = gridCols || readGeom().vc;
  clampSize(wdata, vc);
  state.widgets.push(wdata);

  const item = makeWidget(wdata);
  if (!item) return;
  document.getElementById('grid-canvas').appendChild(item);

  const rules = SIZE_RULES[wdata.type] || {};
  _gridSyncing = true;
  grid.makeWidget(item, {
    id: wdata.id,
    w: Math.min(wdata.w, vc),
    h: wdata.h,
    autoPosition: true,
    minW: rules.minW, maxW: rules.maxW, minH: rules.minH, maxH: rules.maxH,
  });
  grid.compact();
  _gridSyncing = false;
  captureLayout();
  saveState();
  updateEmptyHint();
}

function removeWidget(id) {
  const item = document.querySelector(`.grid-stack-item[data-id="${id}"]`);
  const card = item && item.querySelector('.widget');
  card?._unbindLongPress?.();
  cleanupWidget(id);
  if (grid && item) grid.removeWidget(item, true);
  else item?.remove();
  localStorage.removeItem('dash_limg_' + id);
  state.widgets = state.widgets.filter(w => w.id !== id);
  if (grid) grid.compact();
  captureLayout();
  saveState();
  updateEmptyHint();
}

// Rebuild one widget body in place (link edit); the GridStack node stays.
function renderWidget(id) {
  const wdata = state.widgets.find(w => w.id === id);
  const item = document.querySelector(`.grid-stack-item[data-id="${id}"]`);
  const card = item && item.querySelector('.widget');
  const body = card && card.querySelector('.w-body');
  if (!wdata || !body) return;
  cleanupWidget(id);
  body.innerHTML = '';
  try { REG[wdata.type]?.render(body, wdata.config, id, wdata); }
  catch (e) { console.error('[Widget render error]', e); }
}

function renderAll() {
  const canvas = document.getElementById('grid-canvas');
  if (grid) { grid.destroy(false); grid = null; }
  canvas.querySelectorAll('.grid-stack-item').forEach(el => el.remove());

  initGrid();
  _gridSyncing = true;
  const vc = gridCols;
  const saved = state.gridLayouts[vc] || null;

  state.widgets.forEach(w => {
    clampSize(w, vc);
    const item = makeWidget(w);
    if (!item) return;
    canvas.appendChild(item);
    const s = saved && saved[w.id];
    const rules = SIZE_RULES[w.type] || {};
    grid.makeWidget(item, {
      id: w.id,
      x: s ? s.x : undefined,
      y: s ? s.y : undefined,
      w: s ? s.w : Math.min(w.w, vc),
      h: s ? s.h : w.h,
      autoPosition: !s,
      minW: rules.minW, maxW: rules.maxW, minH: rules.minH, maxH: rules.maxH,
    });
  });

  // A saved layout is already the user's compacted result; compacting again
  // on load can move items and break exact viewport-restore. Only compact
  // when there is no saved layout for this column count.
  if (!saved) grid.compact();
  _gridSyncing = false;
  captureLayout();
  updateEmptyHint();
  if (editMode) buildGridBg();
}

function updateEmptyHint() {
  document.getElementById('empty-hint').style.opacity = state.widgets.length ? '0' : '1';
}

// Column changes are handled explicitly so each column count has its own
// saved layout: shrinking then restoring the window returns to the exact
// same positions.
let resizeTimer;
function scheduleReflow() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!grid) return;
    const vc = readGeom().vc;
    if (vc === gridCols) {
      // Same column count, new cell width (e.g. window drag/zoom).
      grid.cellHeight('auto');
      return;
    }
    captureLayout();
    _gridSyncing = true;
    grid.column(vc, 'none');
    gridCols = vc;
    const saved = state.gridLayouts[vc];
    if (saved) applyLayout(saved);
    else grid.compact();
    _gridSyncing = false;
    captureLayout();
    if (editMode) buildGridBg();
  }, 120);
}
window.addEventListener('resize', scheduleReflow);
window.addEventListener('beforeunload', () => clearTimeout(resizeTimer), { once: true });
if (typeof ResizeObserver !== 'undefined') {
  const gridOuterEl = document.getElementById('grid-outer');
  if (gridOuterEl) new ResizeObserver(scheduleReflow).observe(gridOuterEl);
}
