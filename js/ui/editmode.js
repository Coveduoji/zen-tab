'use strict';
var editMode = false;

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
  document.body.classList.remove('edit-mode');
  document.getElementById('header').classList.remove('edit-mode-active');
  document.getElementById('edit-bar').classList.remove('visible');
  document.getElementById('grid-bg').classList.remove('visible');
}

// ── Grid background ───────────────────────────────────────
// Sized to the *visible* column count — drawing the full 20-column model
// width regardless of viewport would show empty cells past where a widget
// could ever actually be dropped (see tidyLayout's history for why the
// model width and the visible width must not be conflated).
let _gridBgCols = 0, _gridBgRows = 0;
function buildGridBg() {
  const el   = document.getElementById('grid-bg');
  const cols = visibleCols();
  const rows = Math.max(14, Math.ceil(document.getElementById('grid-canvas').offsetHeight / (rowH()+GAP)));
  if (_gridBgCols === cols && _gridBgRows === rows) {
    el.style.gridTemplateColumns = `repeat(${cols}, ${cw()}px)`;
    el.style.gridTemplateRows    = `repeat(${rows}, ${rowH()}px)`;
    return;
  }
  _gridBgCols = cols; _gridBgRows = rows;
  el.innerHTML = '';
  el.style.gridTemplateColumns = `repeat(${cols}, ${cw()}px)`;
  el.style.gridTemplateRows    = `repeat(${rows}, ${rowH()}px)`;
  el.style.gap = `${GAP}px`;
  for (let i = 0; i < cols * rows; i++) {
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
    const pct = Math.min(1, (ts-start)/LP_DUR);
    fill.style.strokeDashoffset = C * (1-pct);
    if (pct < 1 && lpTimer) lpTimer = requestAnimationFrame(frame);
    else if (pct >= 1) { ring.style.display='none'; enterEditMode(); }
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
    debouncedSaveState(); positionAll();
    toast(t('layout_tidied'), 'ok');
  });
  document.getElementById('grid-canvas').addEventListener('mousedown', startLongPress);
  document.addEventListener('mouseup',   cancelLongPress);
  document.addEventListener('mousemove', e => {
    if (lpTimer && (Math.abs(e.clientX-lpX)+Math.abs(e.clientY-lpY) > 8)) cancelLongPress();
  });
}
