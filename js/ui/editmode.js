'use strict';
var editMode = false;

// ── Multi-select state ────────────────────────────────────
const _selected = new Set();

function toggleSelect(id) {
  const el = document.querySelector(`.widget[data-id="${id}"]`);
  if (_selected.has(id)) {
    _selected.delete(id);
    el?.classList.remove('selected');
  } else {
    _selected.add(id);
    el?.classList.add('selected');
  }
  _syncTrashZone();
}

function clearSelection() {
  _selected.forEach(id => {
    document.querySelector(`.widget[data-id="${id}"]`)?.classList.remove('selected');
  });
  _selected.clear();
  _syncTrashZone();
}

function _syncTrashZone() {
  const trash = document.getElementById('trash-zone');
  if (!trash) return;
  const show = editMode && _selected.size > 0;
  trash.classList.toggle('visible', show);
  if (!show) { trash.classList.remove('over'); return; }
  const lbl = document.getElementById('trash-label');
  if (lbl) lbl.textContent = lang === 'zh'
    ? `拖入删除 ${_selected.size} 个`
    : `Drop to delete ${_selected.size}`;
}

let _trashTop = 0; // cached once when trash becomes visible

function _cacheTrashRect() {
  const trash = document.getElementById('trash-zone');
  if (trash) _trashTop = trash.getBoundingClientRect().top;
}
let _multiDragActive = false;
let _multiDragStartX = 0, _multiDragStartY = 0;
let _multiDragGhosts = []; // { el, origLeft, origTop }

function startMultiDrag(e, leadEl) {
  if (!editMode || _selected.size === 0) return false;
  if (!_selected.has(leadEl.dataset.id)) return false;

  _multiDragActive = true;
  _multiDragStartX = e.clientX;
  _multiDragStartY = e.clientY;
  _multiDragGhosts = [];

  _selected.forEach(id => {
    const el = document.querySelector(`.widget[data-id="${id}"]`);
    if (!el) return;
    // Use transform for GPU-composited movement — no reflow
    el.style.transition = 'none';
    el.style.willChange = 'transform';
    el.style.zIndex = '500';
    el.style.opacity = el === leadEl ? '0.9' : '0.45';
    _multiDragGhosts.push({
      el,
      origLeft: parseFloat(el.style.left) || 0,
      origTop:  parseFloat(el.style.top)  || 0,
    });
  });

  document.body.classList.add('any-dragging');
  _cacheTrashRect();
  return true;
}

function moveMultiDrag(e) {
  if (!_multiDragActive) return;
  const dx = e.clientX - _multiDragStartX;
  const dy = e.clientY - _multiDragStartY;

  // transform: translate — GPU composited, zero reflow
  _multiDragGhosts.forEach(({ el }) => {
    el.style.transform = `translate(${dx}px, ${dy}px)`;
  });

  // Trash zone hit-test — only do precise check when cursor is near bottom
  const trash = document.getElementById('trash-zone');
  if (trash) {
    const near = e.clientY > _trashTop - 80;
    if (near) {
      const tr = trash.getBoundingClientRect();
      trash.classList.toggle('over', e.clientY > tr.top && e.clientX > tr.left && e.clientX < tr.right);
    } else {
      trash.classList.remove('over');
    }
  }
}

function endMultiDrag(e) {
  if (!_multiDragActive) return;
  _multiDragActive = false;
  document.body.classList.remove('any-dragging');

  const trash = document.getElementById('trash-zone');
  const isOverTrash = trash?.classList.contains('over');
  trash?.classList.remove('over');

  if (isOverTrash) {
    // ── Delete path ──────────────────────────────────────
    const toDelete = [..._selected];
    // Snap ghosts to trash visually before removing
    _multiDragGhosts.forEach(({ el }) => {
      el.style.transition = 'transform .2s var(--ease), opacity .2s ease';
      const tr = trash.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      const tx = tr.left + tr.width  / 2 - (er.left + er.width  / 2);
      const ty = tr.top  + tr.height / 2 - (er.top  + er.height / 2);
      el.style.transform = `translate(${tx}px, ${ty}px) scale(0.3)`;
      el.style.opacity = '0';
    });
    setTimeout(() => {
      clearSelection();
      if (document.startViewTransition) {
        document.startViewTransition(() => toDelete.forEach(id => removeWidget(id, true)));
      } else {
        toDelete.forEach(id => removeWidget(id, true));
      }
      toast(lang === 'zh'
        ? `已删除 ${toDelete.length} 个组件`
        : `Deleted ${toDelete.length} widget${toDelete.length > 1 ? 's' : ''}`, '');
    }, 220);

  } else {
    // ── Reposition path ──────────────────────────────────
    const dx = e.clientX - _multiDragStartX;
    const dy = e.clientY - _multiDragStartY;
    const updates = _multiDragGhosts.map(({ el, origLeft, origTop }) => {
      const nx = origLeft + dx;
      const ny = origTop  + dy;
      const snapCol = Math.max(0, Math.min(visibleCols() - 1, Math.round(nx / (cw() + GAP))));
      const snapRow = Math.max(0, Math.round(ny / (rowH() + GAP)));
      const wdata = state.widgets.find(w => w.id === el.dataset.id);
      if (wdata) { wdata.x = snapCol; wdata.y = snapRow; clamp(wdata); }
      return { el, wdata };
    });

    // Resolve collisions then compact — same as single-widget drop
    updates.forEach(({ wdata }) => { if (wdata) pushDown(wdata, state.widgets); });
    compact(state.widgets);
    debouncedSaveState();

    requestAnimationFrame(() => {
      updates.forEach(({ el, wdata }) => {
        if (!wdata) return;
        const finalPx = wPx(wdata);
        el.style.transform  = '';
        el.style.willChange = '';
        el.style.transition = 'none';
        el.style.opacity    = '';
        el.style.zIndex     = '';
        el.classList.add('no-anim');
        el.style.left = finalPx.left + 'px';
        el.style.top  = finalPx.top  + 'px';
      });
      void document.getElementById('grid-canvas').offsetHeight;
      requestAnimationFrame(() => {
        updates.forEach(({ el }) => {
          el.style.transition = '';
          el.classList.remove('no-anim');
        });
      });
    });

    _multiDragGhosts = [];
  }
}

// ── Enter / Exit ──────────────────────────────────────────
function enterEditMode() {
  if (editMode) return;
  editMode = true;
  document.body.classList.add('edit-mode');
  document.getElementById('header').classList.add('edit-mode-active');
  document.getElementById('edit-bar').classList.add('visible');
  document.getElementById('btn-edit-toggle')?.classList.add('active');
  document.getElementById('grid-bg').classList.add('visible');
  buildGridBg();
  toast(t('edit_mode_toast'), '');
}

function exitEditMode() {
  if (!editMode) return;
  editMode = false;
  clearSelection();
  document.body.classList.remove('edit-mode');
  document.getElementById('header').classList.remove('edit-mode-active');
  document.getElementById('edit-bar').classList.remove('visible');
  document.getElementById('grid-bg').classList.remove('visible');
  document.getElementById('trash-zone')?.classList.remove('visible');
}

// ── Grid background ───────────────────────────────────────
let _gridBgCols = 0, _gridBgRows = 0;
function buildGridBg() {
  const el   = document.getElementById('grid-bg');
  const rows = Math.max(14, Math.ceil(document.getElementById('grid-canvas').offsetHeight / (rowH()+GAP)));
  if (_gridBgCols === COLS && _gridBgRows === rows) {
    el.style.gridTemplateColumns = `repeat(${COLS}, ${cw()}px)`;
    el.style.gridTemplateRows    = `repeat(${rows}, ${rowH()}px)`;
    el.style.paddingLeft = '0px';
    return;
  }
  _gridBgCols = COLS; _gridBgRows = rows;
  el.innerHTML = '';
  el.style.gridTemplateColumns = `repeat(${COLS}, ${cw()}px)`;
  el.style.gridTemplateRows    = `repeat(${rows}, ${rowH()}px)`;
  el.style.gap         = `${GAP}px`;
  el.style.paddingLeft = '0px';
  for (let i = 0; i < COLS * rows; i++) {
    const c = document.createElement('div'); c.className = 'grid-bg-cell'; el.appendChild(c);
  }
}

// ── Long-press on canvas to enter edit mode ───────────────
const LP_DUR = 700;
let lpTimer = null, lpX = 0, lpY = 0;

function startLongPress(e) {
  if (editMode) return;
  const el = e.target;
  if (el.closest('.widget') || el.closest('#edit-bar') || el.closest('#header')) return;
  lpX = e.clientX; lpY = e.clientY;
  const ring = document.getElementById('lp-ring');
  const fill = document.getElementById('lp-ring-fill');
  const C = 69.1;
  ring.style.left = lpX + 'px'; ring.style.top = lpY + 'px'; ring.style.display = 'block';
  fill.style.strokeDashoffset = C;
  let start = null;
  function frame(ts) {
    if (!start) start = ts;
    const pct = Math.min(1, (ts - start) / LP_DUR);
    fill.style.strokeDashoffset = C * (1 - pct);
    if (pct < 1 && lpTimer) lpTimer = requestAnimationFrame(frame);
    else if (pct >= 1) { ring.style.display = 'none'; enterEditMode(); }
  }
  lpTimer = requestAnimationFrame(frame);
}
function cancelLongPress() {
  if (lpTimer) { cancelAnimationFrame(lpTimer); lpTimer = null; }
  document.getElementById('lp-ring').style.display = 'none';
}

function initEditMode() {
  document.getElementById('btn-done').addEventListener('click', exitEditMode);
  document.getElementById('btn-tidy').addEventListener('click', () => {
    tidyLayout(state.widgets); compact(state.widgets);
    saveState(); renderAll();
    toast(t('layout_tidied'), 'ok');
  });
  document.getElementById('grid-canvas').addEventListener('mousedown', startLongPress);
  document.addEventListener('mouseup', cancelLongPress);
  document.addEventListener('mousemove', e => {
    if (lpTimer && (Math.abs(e.clientX - lpX) + Math.abs(e.clientY - lpY) > 8)) cancelLongPress();
    if (_multiDragActive) moveMultiDrag(e);
  });
  document.addEventListener('mouseup', e => {
    if (_multiDragActive) endMultiDrag(e);
  });
}
