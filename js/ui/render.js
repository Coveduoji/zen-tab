'use strict';
/* ═══════════════════════════════════════════════════════
   RENDER — powered by Gridstack.js
   ═══════════════════════════════════════════════════════ */

let _grid = null; // GridStack instance

function saveWCfg(id, cfg) {
  const w = state.widgets.find(w => w.id === id);
  if (w) { w.config = cfg; saveState(); }
}

// ── Build inner content — returns { el, mount }
// mount() must be called AFTER el is in the document
function _makeWidgetContent(wdata) {
  const def = REG[wdata.type];
  if (!def) return null;
  clamp(wdata);

  const isLink = wdata.type === 'link';
  const titleText = isLink ? (wdata.config.name || def.name) : def.name;

  const el = document.createElement('div');
  el.className = 'widget';
  el.dataset.id = wdata.id;
  el.dataset.type = wdata.type;

  el.innerHTML = `
    <div class="w-del-badge" title="Delete">−</div>
    ${isLink
      ? `<div class="w-controls" style="position:absolute;top:4px;right:4px;z-index:10;display:flex;gap:2px;opacity:0;transition:opacity var(--t)"></div>`
      : `<div class="w-header">
          <div class="w-title"><span class="ico">${def.icon}</span><span>${titleText}</span></div>
          <div class="w-controls" style="display:flex;gap:3px;opacity:0;transition:opacity var(--t)"></div>
        </div>`}
    <div class="w-body"></div>`;

  el.addEventListener('mouseenter', () => { if (!editMode) el.querySelector('.w-controls')?.style.setProperty('opacity','1'); });
  el.addEventListener('mouseleave', () => { el.querySelector('.w-controls')?.style.setProperty('opacity','0'); });
  el.addEventListener('contextmenu', e => openCtxMenu(e, wdata.id));
  el.querySelector('.w-del-badge').addEventListener('click', e => {
    e.stopPropagation(); removeWidget(wdata.id); toast(t('widget_removed'), '');
  });
  el.addEventListener('mousedown', e => {
    if (e.button !== 0 || e.target.closest('.w-del-badge')) return;
    if (editMode) el._pressTime = Date.now();
  });
  el.addEventListener('mouseup', e => {
    if (e.button !== 0) return;
    if (editMode && el._pressTime && Date.now() - el._pressTime < 250) toggleSelect(wdata.id);
    el._pressTime = 0;
  });
  _initWLP(el);

  // mount() calls def.render AFTER el is in document so getElementById works
  function mount() {
    const body = el.querySelector('.w-body');
    try {
      def.render(body, wdata.config, wdata.id, wdata);
    } catch(err) {
      console.error('[Widget render error]', wdata.id, err);
      body.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;padding:12px;text-align:center"><div style="font-size:1.4rem;opacity:.5">⚠️</div><div style="font-size:.75rem;color:var(--text-muted);font-weight:600">Render error</div><div style="font-family:var(--mono);font-size:.62rem;color:var(--text-dim);word-break:break-all;max-height:60px;overflow:hidden">${(err?.message||'').slice(0,120)}</div></div>`;
    }
  }

  return { el, mount };
}

// ── Long-press to enter edit mode ─────────────────────────
const _WLP_DUR = 650;
let _wlp = null;

function _wlpStop() {
  if (!_wlp) return;
  if (_wlp.timer) cancelAnimationFrame(_wlp.timer);
  document.getElementById('lp-ring').style.display = 'none';
  _wlp = null;
}

function _initWLP(el) {
  el.addEventListener('mousedown', e => {
    if (editMode || e.button !== 0) return;
    if (e.target.closest('.w-del-badge')) return;
    const ring = document.getElementById('lp-ring');
    const fill = document.getElementById('lp-ring-fill');
    const C = 69.1;
    ring.style.left = e.clientX + 'px';
    ring.style.top  = e.clientY + 'px';
    ring.style.display = 'block';
    fill.style.strokeDashoffset = C;
    _wlp = { el, timer: null, startX: e.clientX, startY: e.clientY, startTs: null };
    function frame(ts) {
      if (!_wlp || _wlp.el !== el) return;
      if (!_wlp.startTs) _wlp.startTs = ts;
      const pct = Math.min(1, (ts - _wlp.startTs) / _WLP_DUR);
      fill.style.strokeDashoffset = C * (1 - pct);
      if (pct < 1) _wlp.timer = requestAnimationFrame(frame);
      else { _wlpStop(); enterEditMode(); }
    }
    _wlp.timer = requestAnimationFrame(frame);
  });
  el.addEventListener('mousemove', e => {
    if (_wlp?.el === el && (Math.abs(e.clientX - _wlp.startX) + Math.abs(e.clientY - _wlp.startY) > 5)) _wlpStop();
  });
  el.addEventListener('mouseup',    () => { if (_wlp?.el === el) _wlpStop(); });
  el.addEventListener('mouseleave', () => { if (_wlp?.el === el) _wlpStop(); });
}

// ── Gridstack init + render ───────────────────────────────
function renderAll() {
  if (_grid) {
    // Destroy cleanly
    _grid.getGridItems().forEach(item => {
      const id = item.getAttribute('gs-id');
      if (id) cleanupWidget(id);
    });
    _grid.destroy(false); // false = keep DOM elements for us to remove
    document.getElementById('grid-canvas').innerHTML = '';
    _grid = null;
  }

  _grid = GridStack.init({
    column: COLS,
    cellHeight: 90,
    cellHeightUnit: 'px',
    margin: 8,
    animate: false,
    draggable: { enabled: false },
    resizable: { enabled: false },
    disableOneColumnMode: true,
    float: false,
    el: '#grid-canvas',
  });

  // Add each widget individually so DOM is immediately available
  state.widgets.forEach(wdata => {
    const widget = _makeWidgetContent(wdata);
    if (!widget) return;
    const { el, mount } = widget;

    const gsItem = _grid.addWidget({
      id: wdata.id,
      x: wdata.x, y: wdata.y,
      w: wdata.w, h: wdata.h,
      content: '<div></div>', // placeholder so gridstack creates the item
    });

    // Replace placeholder with real DOM (with event listeners)
    const contentEl = gsItem.querySelector('.grid-stack-item-content');
    if (contentEl) {
      contentEl.innerHTML = '';
      contentEl.appendChild(el);
      // mount AFTER el is in document so getElementById works in widget renders
      mount();
    }
  });

  // Sync Gridstack changes back to state
  _grid.on('change', (event, items) => {
    if (!items) return;
    items.forEach(item => {
      const w = state.widgets.find(w => w.id === item.id);
      if (w) { w.x = item.x; w.y = item.y; w.w = item.w; w.h = item.h; }
    });
    debouncedSaveState();
  });

  updateEmptyHint();
  if (editMode) _setGridEditable(true);
}

function _setGridEditable(enabled) {
  if (!_grid) return;
  if (enabled) {
    _grid.enableMove(true);
    _grid.enableResize(true);
  } else {
    _grid.enableMove(false);
    _grid.enableResize(false);
  }
}

// Update widget positions in-place (avoids full re-render after tidy)
function refreshGridLayout(widgets) {
  if (!_grid) { renderAll(); return; }
  const wMap = new Map(widgets.map(w => [w.id, w]));
  _grid.batchUpdate(true);
  _grid.getGridItems().forEach(gsItem => {
    const id = gsItem.getAttribute('gs-id');
    const w = wMap.get(id);
    if (w) _grid.update(gsItem, { x: w.x, y: w.y, w: w.w, h: w.h });
  });
  _grid.batchUpdate(false);
}

function addWidget(wdata) {
  clamp(wdata);
  // Find free slot in current layout
  const slot = findFreeSlot(wdata.w, wdata.h, state.widgets);
  wdata.x = slot.x; wdata.y = slot.y;
  state.widgets.push(wdata);

  if (_grid) {
    const widget = _makeWidgetContent(wdata);
    if (widget) {
      const { el, mount } = widget;
      const gsItem = _grid.addWidget({
        id: wdata.id, x: wdata.x, y: wdata.y, w: wdata.w, h: wdata.h,
        content: '<div></div>',
      });
      const contentEl = gsItem?.querySelector('.grid-stack-item-content');
      if (contentEl) {
        contentEl.innerHTML = '';
        contentEl.appendChild(el);
        mount();
      }
    }
  }

  saveState();
  updateEmptyHint();
}

function removeWidget(id) {
  cleanupWidget(id);
  const gsItem = document.querySelector(`.grid-stack-item[gs-id="${id}"]`);
  if (gsItem && _grid) _grid.removeWidget(gsItem);
  localStorage.removeItem('dash_limg_' + id);
  state.widgets = state.widgets.filter(w => w.id !== id);
  saveState();
  updateEmptyHint();
}

function updateEmptyHint() {
  document.getElementById('empty-hint').style.opacity = state.widgets.length ? '0' : '1';
}
