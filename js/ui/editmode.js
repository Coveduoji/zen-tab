'use strict';
var editMode = false;

// ── Multi-select (click to select, btn to delete) ─────────
const _selected = new Set();

function toggleSelect(id) {
  const gsItem = document.querySelector(`.grid-stack-item[gs-id="${id}"]`);
  if (_selected.has(id)) {
    _selected.delete(id);
    gsItem?.querySelector('.widget')?.classList.remove('selected');
  } else {
    _selected.add(id);
    gsItem?.querySelector('.widget')?.classList.add('selected');
  }
  _syncDelBtn();
}

function clearSelection() {
  _selected.forEach(id => {
    document.querySelector(`.grid-stack-item[gs-id="${id}"] .widget`)?.classList.remove('selected');
  });
  _selected.clear();
  _syncDelBtn();
}

function _syncDelBtn() {
  const btn = document.getElementById('btn-del-selected');
  if (!btn) return;
  const show = editMode && _selected.size > 0;
  btn.style.display = show ? '' : 'none';
  if (show) btn.textContent = lang === 'zh' ? `删除 ${_selected.size} 个` : `Delete ${_selected.size}`;
}

// ── Enter / Exit ──────────────────────────────────────────
function enterEditMode() {
  if (editMode) return;
  editMode = true;
  document.body.classList.add('edit-mode');
  document.getElementById('header').classList.add('edit-mode-active');
  document.getElementById('edit-bar').classList.add('visible');
  document.getElementById('btn-edit-toggle')?.classList.add('active');
  _setGridEditable(true);
  toast(t('edit_mode_toast'), '');
}

function exitEditMode() {
  if (!editMode) return;
  editMode = false;
  clearSelection();
  document.body.classList.remove('edit-mode');
  document.getElementById('header').classList.remove('edit-mode-active');
  document.getElementById('edit-bar').classList.remove('visible');
  _setGridEditable(false);
}

// ── Long-press on empty canvas area ──────────────────────
const LP_DUR = 700;
let lpTimer = null, lpX = 0, lpY = 0;

function startLongPress(e) {
  if (editMode) return;
  const el = e.target;
  if (el.closest('.grid-stack-item') || el.closest('#edit-bar') || el.closest('#header')) return;
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
    tidyLayout(state.widgets);
    compact(state.widgets);
    saveState();
    renderAll();
    toast(t('layout_tidied'), 'ok');
  });

  document.getElementById('btn-del-selected')?.addEventListener('click', () => {
    const toDelete = [..._selected];
    clearSelection();
    if (document.startViewTransition) {
      document.startViewTransition(() => toDelete.forEach(id => removeWidget(id)));
    } else {
      toDelete.forEach(id => removeWidget(id));
    }
    toast(lang === 'zh'
      ? `已删除 ${toDelete.length} 个组件`
      : `Deleted ${toDelete.length} widget${toDelete.length > 1 ? 's' : ''}`, '');
  });

  document.getElementById('grid-canvas').addEventListener('mousedown', startLongPress);
  document.addEventListener('mouseup', cancelLongPress);
  document.addEventListener('mousemove', e => {
    if (lpTimer && (Math.abs(e.clientX - lpX) + Math.abs(e.clientY - lpY) > 8)) cancelLongPress();
  });
}
