/* ═══════════════════════════════════════════════════════
   WIDGET INSTANCE MANAGER — GridStack integration
   ═══════════════════════════════════════════════════════ */

var grid = null;          // GridStack instance
var gridCols = 0;         // current column count
var _gridSyncing = false; // ignore change events while loading/column switching
let _captureTimer = 0;
// Fallback for GridStack dragstop events that don't carry pointer coordinates.
let _lastPointer = { x: null, y: null };
document.addEventListener('pointermove', e => { _lastPointer.x = e.clientX; _lastPointer.y = e.clientY; }, { passive: true });
// Geometry of every widget at dragstart. GridStack reflows/swaps cards during
// a drag, so at release the icon the user dropped on has usually moved away;
// the snapshot answers "which icon was under the pointer when the drag began".
let _dragStartRects = [];

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

// Edit mode is for moving/resizing/deleting only. inert on the card content
// disables links, buttons, inputs, iframes and keyboard focus in one go.
function setWidgetInert(card, inert) {
  if (!card) return;
  // Folders stay interactive in edit mode so opening one still works while
  // laying out the dashboard; links remain inert so a stray click can't
  // navigate away mid-edit.
  const keepInteractive = card.dataset.type === 'folder';
  for (const el of card.querySelectorAll('.w-body, .w-header')) {
    if (inert && !keepInteractive) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }
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
  const isFolder = wdata.type === 'folder';
  const isIcon = isLink || isFolder;
  const titleText = isIcon ? (wdata.config.name || def.name) : def.name;
  const wR = 28; const wC = 2*Math.PI*wR;
  const delLabel = t('del_btn');

  el.innerHTML = `
    <button class="w-delete" type="button" title="${esc(delLabel)}" aria-label="${esc(delLabel)}">×</button>
    ${isIcon
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
    confirm2(
      isFolder ? t('folder_del_confirm_t') : t('del_confirm_t'),
      isFolder ? t('folder_del_confirm_s') : t('del_confirm_s'),
      t('del_btn'),
      ok => {
        if (!ok) return;
        removeWidget(wdata.id);
        toast(t('widget_removed'), '');
      },
    );
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
  if (isFolder) {
    // Opening a folder is allowed in edit mode too, so its contents can be
    // rearranged without leaving edit mode. The folder's body is not inerted
    // (see setWidgetInert).
    el.addEventListener('click', e => {
      if (el._wasDragged) return;
      if (e.target.closest(NO_DRAG_SELECTOR)) return;
      openFolder(wdata.id, { edit: editMode });
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
  if (editMode) setWidgetInert(el, true);

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
  grid.on('dragstart', (_e, el) => {
    setCardDragged(el, true);
    _dragStartRects = [...document.querySelectorAll('#grid-canvas .grid-stack-item')]
      .map(item => {
        const id = item.dataset.id;
        if (!id) return null;
        const r = item.getBoundingClientRect();
        return { id, type: item.dataset.type, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      })
      .filter(Boolean);
  });
  grid.on('dragstop', (event, el) => {
    setTimeout(() => setCardDragged(el, false), 300);
    // Dropping one icon on another is a folder gesture. It is limited to edit
    // mode (the phone "jiggle" equivalent) so ordinary reordering in normal
    // mode can never merge icons by accident.
    const drop = editMode ? _folderDropTarget(event, el) : null;
    // Only compact if the drop actually produced overlapping nodes. A valid
    // drop is left where the user put it.
    resolveOverlap();
    scheduleCapture();
    if (drop) setTimeout(() => _applyFolderDrop(el.dataset.id, drop.dataset.id), 0);
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
    resolveOverlap();
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

function layoutHasOverlap() {
  if (!grid) return false;
  const nodes = grid.save(false);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w &&
          a.y < b.y + b.h && b.y < a.y + a.h) return true;
    }
  }
  return false;
}

// GridStack can persist/load overlapping nodes after a resize (trial bug).
// Repair only when needed; a valid layout is left untouched so per-column
// restore stays exact.
function resolveOverlap() {
  if (!grid || !layoutHasOverlap()) return false;
  const prev = _gridSyncing;
  _gridSyncing = true;
  grid.compact();
  _gridSyncing = prev;
  return true;
}

function applyLayout(map) {
  if (!grid || !map) return;
  const items = Object.entries(map).map(([id, pos]) => ({
    id, x: pos.x, y: pos.y, w: pos.w, h: pos.h,
  }));
  // Atomic load (no add/remove) preserves the saved column layout exactly.
  grid.load(items, false);
  resolveOverlap();
}

// Mount one widget into the live grid. The widget must already be present in
// state.widgets: addWidget pushes it, unfileLink re-mounts an existing child.
function mountWidget(wdata) {
  if (!grid) initGrid();
  const vc = gridCols || readGeom().vc;
  clampSize(wdata, vc);

  const item = makeWidget(wdata);
  if (!item) return null;
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
  return item;
}

// Batch variant used when a folder is deleted and all of its links return to
// the dashboard at once. One GridStack batch + one compact instead of N.
function mountWidgets(wdatas) {
  if (!Array.isArray(wdatas) || !wdatas.length) return 0;
  if (!grid) initGrid();
  const vc = gridCols || readGeom().vc;
  const canvas = document.getElementById('grid-canvas');
  const prevSync = _gridSyncing;
  const created = [];
  _gridSyncing = true;
  grid.batchUpdate();
  for (const wdata of wdatas) {
    clampSize(wdata, vc);
    const item = makeWidget(wdata);
    if (!item) continue;
    canvas.appendChild(item);
    const rules = SIZE_RULES[wdata.type] || {};
    grid.makeWidget(item, {
      id: wdata.id,
      w: Math.min(wdata.w, vc),
      h: wdata.h,
      autoPosition: true,
      minW: rules.minW, maxW: rules.maxW, minH: rules.minH, maxH: rules.maxH,
    });
    created.push(wdata);
  }
  grid.batchUpdate(false);
  grid.compact();
  _gridSyncing = prevSync;
  return created.length;
}

function addWidget(wdata) {
  state.widgets.push(wdata);
  mountWidget(wdata);
  captureLayout();
  saveState();
  updateEmptyHint();
}

// Batch-create link widgets (used by Settings → batch add quick links).
function addWidgets(configs) {
  if (!Array.isArray(configs) || !configs.length) return 0;
  if (!grid) initGrid();
  const vc = gridCols || readGeom().vc;
  const canvas = document.getElementById('grid-canvas');
  const rules = SIZE_RULES.link || { minW:1, maxW:2, minH:1, maxH:2 };
  const created = [];

  for (const cfg of configs) {
    const wdata = {
      id: genId('link'), type: 'link', w: rules.defW || 1, h: rules.defH || 1,
      config: { name: cfg.name, url: cfg.url },
    };
    clampSize(wdata, vc);
    state.widgets.push(wdata);
    const item = makeWidget(wdata);
    if (!item) continue;
    canvas.appendChild(item);
    created.push({ item, wdata });
  }
  if (!created.length) return 0;

  _gridSyncing = true;
  grid.batchUpdate();
  for (const { item, wdata } of created) {
    grid.makeWidget(item, {
      id: wdata.id,
      w: Math.min(wdata.w, vc),
      h: wdata.h,
      autoPosition: true,
      minW: rules.minW, maxW: rules.maxW, minH: rules.minH, maxH: rules.maxH,
    });
  }
  grid.batchUpdate(false);
  grid.compact();
  _gridSyncing = false;
  captureLayout();
  saveState();
  updateEmptyHint();
  return created.length;
}

// ── Folders ───────────────────────────────────────────────
// A folder stores only child link ids. The links themselves stay in
// state.widgets (so saveState's custom-icon bookkeeping still sees them) but
// are not mounted while filed.
function filedLinkIds() {
  const ids = new Set();
  for (const w of state.widgets) {
    if (w.type === 'folder' && Array.isArray(w.config?.childIds)) {
      for (const id of w.config.childIds) ids.add(id);
    }
  }
  return ids;
}

function _dropLayoutFor(id) {
  for (const vc of Object.keys(state.gridLayouts || {})) {
    const map = state.gridLayouts[vc];
    if (map && Object.prototype.hasOwnProperty.call(map, id)) delete map[id];
  }
}

function _detachGridItem(id) {
  const item = document.querySelector(`.grid-stack-item[data-id="${id}"]`);
  if (!item) return null;
  const card = item.querySelector('.widget');
  card?._unbindLongPress?.();
  cleanupWidget(id);
  const node = item.gridstackNode;
  const pos = node ? { x: node.x, y: node.y, w: node.w, h: node.h } : null;
  if (grid) grid.removeWidget(item, true); else item.remove();
  _dropLayoutFor(id);
  return pos;
}

// Move one or more links into a folder. Used by the folder picker and by
// dropping a link onto a folder tile in edit mode.
function fileLinks(linkIds, folderId) {
  const folder = state.widgets.find(w => w.id === folderId && w.type === 'folder');
  if (!folder) return 0;
  folder.config.childIds = Array.isArray(folder.config.childIds) ? folder.config.childIds : [];
  const already = new Set(folder.config.childIds);
  const prevSync = _gridSyncing;
  if (grid) { grid.batchUpdate(); _gridSyncing = true; }
  let moved = 0;
  for (const id of linkIds) {
    if (already.has(id)) continue;
    const link = state.widgets.find(w => w.id === id && w.type === 'link');
    if (!link) continue;
    // Keep a link in exactly one folder.
    for (const f of state.widgets) {
      if (f.type !== 'folder' || f.id === folderId || !Array.isArray(f.config?.childIds)) continue;
      const i = f.config.childIds.indexOf(id);
      if (i >= 0) { f.config.childIds.splice(i, 1); renderWidget(f.id); }
    }
    already.add(id);
    folder.config.childIds.push(id);
    _detachGridItem(id);
    moved++;
  }
  if (grid) grid.batchUpdate(false);
  _gridSyncing = prevSync;
  if (!moved) return 0;
  if (grid) grid.compact();
  renderWidget(folderId);
  captureLayout();
  saveState();
  updateEmptyHint();
  return moved;
}

function fileLink(linkId, folderId) { return fileLinks([linkId], folderId) > 0; }

// Return a link from a folder to the dashboard grid.
function unfileLink(linkId) {
  let parent = null;
  for (const w of state.widgets) {
    if (w.type !== 'folder' || !Array.isArray(w.config?.childIds)) continue;
    const i = w.config.childIds.indexOf(linkId);
    if (i >= 0) { w.config.childIds.splice(i, 1); parent = w; break; }
  }
  if (!parent) return false;
  const link = state.widgets.find(w => w.id === linkId && w.type === 'link');
  if (link) mountWidget(link);
  renderWidget(parent.id);
  captureLayout();
  saveState();
  updateEmptyHint();
  return true;
}

// Create a new folder from two links (the phone gesture: drop one icon on
// another). The folder lands at the drop point (the source's post-swap slot).
function createFolderFromLinks(aId, bId, pos) {
  const a = state.widgets.find(w => w.id === aId && w.type === 'link');
  const b = state.widgets.find(w => w.id === bId && w.type === 'link');
  if (!a || !b || aId === bId) return null;
  const vc = gridCols || readGeom().vc;
  const side = Math.min(2, Math.max(1, Math.min(pos?.w || 1, pos?.h || 1)));
  const folder = {
    id: genId('folder'), type: 'folder', w: side, h: side,
    config: { name: t('folder_default'), childIds: [aId, bId] },
  };
  clampSize(folder, vc);
  const idx = state.widgets.indexOf(a);
  state.widgets.splice(idx >= 0 ? idx : state.widgets.length, 0, folder);

  _gridSyncing = true;
  _detachGridItem(aId);
  _detachGridItem(bId);
  const item = makeWidget(folder);
  if (item) {
    document.getElementById('grid-canvas').appendChild(item);
    const rules = SIZE_RULES.folder || {};
    grid.makeWidget(item, {
      id: folder.id,
      x: pos ? pos.x : undefined,
      y: pos ? pos.y : undefined,
      w: folder.w, h: folder.h,
      autoPosition: !pos,
      minW: rules.minW, maxW: rules.maxW, minH: rules.minH, maxH: rules.maxH,
    });
    grid.compact();
  }
  _gridSyncing = false;
  captureLayout();
  saveState();
  updateEmptyHint();
  return item ? folder.id : null;
}

// Resolve which widget sits under the pointer when a drag ends. The dragged
// item itself is skipped; a grid placeholder / canvas is not a widget.
function _folderDropTarget(event, draggedEl) {
  const x = event && typeof event.clientX === 'number' ? event.clientX : _lastPointer.x;
  const y = event && typeof event.clientY === 'number' ? event.clientY : _lastPointer.y;
  if (x == null || y == null) return null;
  for (const node of document.elementsFromPoint(x, y)) {
    const card = node.closest && node.closest('.widget');
    if (!card || card === draggedEl || draggedEl.contains(card)) continue;
    return card;
  }
  // GridStack shows its placeholder (and has already swapped the cards) under
  // the pointer at release. Fall back to the geometry captured at dragstart:
  // the icon that occupied the drop point when the drag began is the target.
  const draggedId = draggedEl?.dataset?.id;
  for (const s of _dragStartRects) {
    if (s.id === draggedId) continue;
    if (x >= s.left && x <= s.right && y >= s.top && y <= s.bottom) {
      const item = document.querySelector(`.grid-stack-item[data-id="${s.id}"]`);
      const card = item?.querySelector('.widget');
      if (card) return card;
    }
  }
  return null;
}

function _applyFolderDrop(srcId, tgtId) {
  if (!editMode || !srcId || !tgtId || srcId === tgtId) return;
  const src = state.widgets.find(w => w.id === srcId);
  const tgt = state.widgets.find(w => w.id === tgtId);
  if (!src || !tgt) return;
  if (src.type === 'link' && tgt.type === 'folder') {
    if (fileLink(srcId, tgtId)) {
      toast(t('folder_link_added'), 'ok');
      if (typeof refreshFolderPanel === 'function') refreshFolderPanel();
    }
  } else if (src.type === 'link' && tgt.type === 'link') {
    // The source is at the drop point after GridStack's swap, so put the new
    // folder there rather than at the target's post-swap slot.
    const item = document.querySelector(`.grid-stack-item[data-id="${srcId}"]`);
    const node = item?.gridstackNode;
    const pos = node ? { x: node.x, y: node.y, w: node.w, h: node.h } : null;
    const fid = createFolderFromLinks(tgtId, srcId, pos);
    if (fid) { toast(t('folder_added'), 'ok'); openFolder(fid, { edit: true }); }
  }
}

function removeWidget(id) {
  const wdata = state.widgets.find(w => w.id === id);
  const isFolder = wdata?.type === 'folder';
  const childIds = isFolder ? [...(wdata.config?.childIds || [])] : [];

  const item = document.querySelector(`.grid-stack-item[data-id="${id}"]`);
  const card = item && item.querySelector('.widget');
  card?._unbindLongPress?.();
  cleanupWidget(id);
  if (grid && item) grid.removeWidget(item, true);
  else item?.remove();
  localStorage.removeItem('dash_limg_' + id);

  // Deleting a link also drops its id from any folder that referenced it.
  const affected = [];
  if (!isFolder) {
    for (const f of state.widgets) {
      if (f.type !== 'folder' || !Array.isArray(f.config?.childIds)) continue;
      const i = f.config.childIds.indexOf(id);
      if (i >= 0) { f.config.childIds.splice(i, 1); affected.push(f.id); }
    }
  }

  state.widgets = state.widgets.filter(w => w.id !== id);

  // Deleting a folder returns its links to the dashboard instead of silently
  // deleting them.
  if (isFolder) {
    const children = childIds
      .map(cid => state.widgets.find(w => w.id === cid && w.type === 'link'))
      .filter(Boolean);
    if (children.length) mountWidgets(children);
  }

  if (grid) grid.compact();
  captureLayout();
  saveState();
  updateEmptyHint();
  for (const fid of affected) renderWidget(fid);
  if (typeof refreshFolderPanel === 'function') refreshFolderPanel();
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
  const filed = filedLinkIds();

  state.widgets.forEach(w => {
    // Filed links live inside folders; the folder tile renders their icons.
    if (w.type === 'link' && filed.has(w.id)) return;
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
  // on load can move items and break exact viewport-restore. Only repair it
  // if an older saved layout contains overlapping nodes.
  if (!saved) grid.compact();
  else resolveOverlap();
  _gridSyncing = false;
  captureLayout();
  updateEmptyHint();
  if (editMode) buildGridBg();
}

function updateEmptyHint() {
  // Filed links are in state.widgets but not on the grid — use the DOM so an
  // all-filed dashboard still shows the empty hint when no folders exist.
  const visible = document.querySelectorAll('#grid-canvas .widget').length;
  document.getElementById('empty-hint').style.opacity = visible ? '0' : '1';
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
