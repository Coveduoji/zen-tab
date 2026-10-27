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
  if (grid) grid.enableResize(true);
  // Editing is for layout only: stop links/inputs/iframes from reacting.
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  document.querySelectorAll('#grid-canvas .widget').forEach(card => setWidgetInert(card, true));
  buildGridBg();
  toast(t('edit_mode_toast'), '');
}

function exitEditMode() {
  if (!editMode) return;
  editMode = false;
  document.body.classList.remove('edit-mode');
  document.getElementById('header').classList.remove('edit-mode-active');
  document.getElementById('edit-bar').classList.remove('visible');
  const bg = document.getElementById('grid-bg');
  bg.classList.remove('visible');
  bg.innerHTML = '';
  _gridBgCols = 0; _gridBgRows = 0;
  document.querySelectorAll('#grid-canvas .widget').forEach(card => setWidgetInert(card, false));
  if (grid) grid.enableResize(false);
}

// ── Grid background ───────────────────────────────────────
// Sized to the *visible* column count — drawing the full 20-column model
// width regardless of viewport would show empty cells past where a widget
// could ever actually be dropped.
let _gridBgCols = 0, _gridBgRows = 0;
function buildGridBg() {
  if (!editMode) return;
  const el   = document.getElementById('grid-bg');
  const geom = readGeom();
  const rows = Math.max(14, Math.ceil(document.getElementById('grid-canvas').offsetHeight / (geom.rowH + GAP)));
  // GridStack insets every item by GAP/2, so pad the guide grid by the same
  // amount to line the cells up with the widget content.
  el.style.padding = `${GAP / 2}px`;
  el.style.gridTemplateColumns = `repeat(${geom.vc}, ${geom.colW}px)`;
  el.style.gridTemplateRows    = `repeat(${rows}, ${geom.rowH}px)`;
  el.style.gap = `${GAP}px`;
  if (_gridBgCols === geom.vc && _gridBgRows === rows) return;
  _gridBgCols = geom.vc; _gridBgRows = rows;
  el.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (let i = 0; i < geom.vc * rows; i++) {
    const c = document.createElement('div'); c.className = 'grid-bg-cell'; frag.appendChild(c);
  }
  el.appendChild(frag);
}

// ── Long-press on canvas to enter edit mode ───────────────
// The ring only appears after a deliberate hold; a normal click on blank
// space shows nothing at all.
const LP_DELAY = 200;   // ms before the ring appears
const LP_DUR   = 500;   // ms of visible progress after that
let lpTimer = null, lpDelayTimer = null, lpActive = false, lpX = 0, lpY = 0;

function startLongPress(e) {
  if (editMode || e.button !== 0) return;
  const el = e.target;
  if (el.closest('.widget') || el.closest('#edit-bar') || el.closest('#header')) return;
  lpX = e.clientX; lpY = e.clientY;
  lpActive = true;
  clearTimeout(lpDelayTimer);
  lpDelayTimer = setTimeout(() => {
    lpDelayTimer = null;
    if (!lpActive || editMode) return;
    const ring = document.getElementById('lp-ring');
    const fill = document.getElementById('lp-ring-fill');
    const C = 69.1;
    ring.style.left = lpX + 'px'; ring.style.top = lpY + 'px'; ring.style.display = 'block';
    fill.style.strokeDashoffset = C;
    let start = null;
    function frame(ts) {
      if (!lpActive) return;
      if (!start) start = ts;
      const pct = Math.min(1, (ts-start)/LP_DUR);
      fill.style.strokeDashoffset = C * (1-pct);
      if (pct < 1) lpTimer = requestAnimationFrame(frame);
      else { lpTimer = null; ring.style.display='none'; lpActive = false; enterEditMode(); }
    }
    lpTimer = requestAnimationFrame(frame);
  }, LP_DELAY);
}
function cancelLongPress() {
  lpActive = false;
  clearTimeout(lpDelayTimer); lpDelayTimer = null;
  if (lpTimer) { cancelAnimationFrame(lpTimer); lpTimer = null; }
  document.getElementById('lp-ring').style.display = 'none';
}

function initEditMode() {
  document.getElementById('btn-done').addEventListener('click', exitEditMode);
  document.getElementById('grid-canvas').addEventListener('pointerdown', startLongPress);
  document.addEventListener('pointerup', cancelLongPress);
  document.addEventListener('pointercancel', cancelLongPress);
  document.addEventListener('pointermove', e => {
    if ((lpDelayTimer || lpTimer) && (Math.abs(e.clientX-lpX)+Math.abs(e.clientY-lpY) > 8)) cancelLongPress();
  });
}
