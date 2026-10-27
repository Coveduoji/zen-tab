/* ═══════════════════════════════════════════════════════
   WIDGET INSTANCE MANAGER
   ═══════════════════════════════════════════════════════ */

function saveWCfg(id, cfg, useDebounce = false) {
  const w = state.widgets.find(w=>w.id===id);
  if (w) {
    w.config = cfg;
    if (useDebounce) debouncedSaveState();
    else saveState();
  }
}

// Targets that own their pointer interaction; a widget drag must not start
// when one of these is the actual target. This filter is required because a
// child's `mousedown` stopPropagation does not stop `pointerdown` bubbling.
const NO_DRAG_SELECTOR = 'input, textarea, button, select, a, [contenteditable], [draggable="true"], .rh, .cal-task-item, .cal-add-row';

function makeWidget(wdata, layoutOverrides, geom, pos) {
  const def = REG[wdata.type];
  if (!def) return null;
  const g = geom || readGeom();
  clampSize(wdata, g.vc);
  if (!pos) {
    const layout = computeDenseLayout(state.widgets, g);
    pos = layout.get(wdata.id) || { x: 0, y: 0, w: Math.min(wdata.w, g.vc), h: wdata.h };
  }
  const px = wPx(wdata, pos, g);

  const el = document.createElement('div');
  el.className = 'widget enter' + (typeof pureMode !== 'undefined' && pureMode ? ' pure-hidden' : '');
  el.dataset.id = wdata.id;
  el.dataset.type = wdata.type;
  el.style.cssText = `left:${px.left}px;top:${px.top}px;width:${px.width}px;height:${px.height}px;z-index:10;`;

  // Remove the one-shot entrance class on animationend (plus a fallback for
  // reduced-motion, where no animation runs). Keeping it off .widget means a
  // drag or an edit-mode exit can never replay the entrance animation.
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
    <div class="w-resize-handles">
      <div class="rh se" data-dir="se"></div>
    </div>
    <div class="w-lp-ring" id="wlpr-${wdata.id}">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle class="wlp-track" cx="32" cy="32" r="${wR}" stroke-width="3"/>
        <circle class="wlp-fill" cx="32" cy="32" r="${wR}" stroke-width="3"
          stroke-dasharray="${wC.toFixed(1)}" stroke-dashoffset="${wC.toFixed(1)}" id="wlpf-${wdata.id}"/>
      </svg>
    </div>`;

  // Show controls on hover (normal mode)
  el.addEventListener('mouseenter', () => { if (!editMode) el.querySelector('.w-controls')?.style.setProperty('opacity','1'); });
  el.addEventListener('mouseleave', () => { el.querySelector('.w-controls')?.style.setProperty('opacity','0'); });

  // Right-click context menu — edit/delete (delete also has a corner button
  // in edit mode, matching the documented interaction).
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

  // Render body
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
      '</div>' +
      '</div>';
  }

  /* ────────── WIDGET LONG-PRESS → enter edit mode ────────── */
  // Same as the canvas gesture: no ring for a normal click; the ring appears
  // only after a deliberate hold.
  const WLP_DELAY = 180;
  const WLP_DUR = 500;
  let wlpTimer = null, wlpDelayTimer = null, wlpStart = null, wlpX = 0, wlpY = 0;
  const ringEl = el.querySelector('.w-lp-ring');
  const fillEl = el.querySelector('.wlp-fill');
  const WC_VAL = 2 * Math.PI * 28;

  function stopWLP() {
    clearTimeout(wlpDelayTimer); wlpDelayTimer = null;
    if (wlpTimer) { cancelAnimationFrame(wlpTimer); wlpTimer = null; }
    if (ringEl) { ringEl.style.display='none'; if(fillEl){fillEl.style.opacity='0';} }
    wlpStart = null;
  }

  function startWLP(e) {
    if (editMode) return;
    if (e.button !== 0) return;
    if (e.target.closest(NO_DRAG_SELECTOR)) return;
    wlpX = e.clientX; wlpY = e.clientY;
    clearTimeout(wlpDelayTimer);
    wlpDelayTimer = setTimeout(() => {
      wlpDelayTimer = null;
      if (editMode || dragPointer === null) return;
      wlpStart = null;
      if (ringEl) { ringEl.style.display='block'; fillEl.style.opacity='1'; fillEl.style.strokeDashoffset=WC_VAL; }
      function frame(ts) {
        if (dragPointer === null) return;
        if (!wlpStart) wlpStart = ts;
        const pct = Math.min(1, (ts - wlpStart) / WLP_DUR);
        if (fillEl) fillEl.style.strokeDashoffset = WC_VAL * (1 - pct);
        if (pct < 1 && wlpTimer) wlpTimer = requestAnimationFrame(frame);
        else if (pct >= 1) {
          stopWLP();
          // Release the still-held pointer gesture so moving the mouse after
          // the long-press doesn't immediately start a reorder.
          endDragGesture(dragPointer);
          enterEditMode();
        }
      }
      wlpTimer = requestAnimationFrame(frame);
    }, WLP_DELAY);
  }

  /* ────────── REORDER DRAG (edit mode) ──────────
     The widget follows the pointer with `translate`; a dashed drop marker
     shows where it will land. On release only the array order changes; every
     position is then recomputed deterministically from that order. */
  let dragPointer = null, dragging = false, dragStarted = false;
  let downX = 0, downY = 0;
  let dragGeom = null, dragRAF = 0, pendingMove = null, dragCanvasRect = null;
  let dragTargetIndex = -1;

  function _dropMarker() { return document.getElementById('drop-marker'); }

  function hideDropMarker() {
    const m = _dropMarker();
    if (m) { m.classList.remove('show'); m.style.display = 'none'; }
  }

  function endDragGesture(pointerId) {
    if (dragRAF) { cancelAnimationFrame(dragRAF); dragRAF = 0; }
    pendingMove = null;
    if (pointerId != null) {
      try { el.releasePointerCapture(pointerId); } catch (_) {}
    }
    dragPointer = null;
    dragTargetIndex = -1;
  }

  function beginDrag(e) {
    if (e.button !== 0) return;
    if (e.target.closest(NO_DRAG_SELECTOR)) return;
    // Do not capture yet: capturing on pointerdown retargets the compatibility
    // click, which would break day cells / weather body / pomodoro time clicks.
    dragPointer = e.pointerId;
    dragging = false; dragStarted = false;
    el._wasDragged = false;
    downX = e.clientX; downY = e.clientY;
    dragGeom = readGeom();
    dragCanvasRect = document.getElementById('grid-canvas').getBoundingClientRect();
    startWLP(e);
  }

  function onPointerMove(e) {
    if (e.pointerId !== dragPointer) return;
    if ((wlpDelayTimer || wlpTimer) && (Math.abs(e.clientX-wlpX) + Math.abs(e.clientY-wlpY) > 5)) stopWLP();
    pendingMove = e;
    if (dragRAF) return;
    dragRAF = requestAnimationFrame(processMove);
  }

  // Nearest-center insertion heuristic: insert before/after the widget whose
  // center is closest to the pointer, comparing reading order within a row.
  function _findInsertIndex(pointerX, pointerY, others) {
    const currentLayout = computeDenseLayout(state.widgets, dragGeom);
    let best = others.length;
    let bestDist = Infinity;
    for (let i = 0; i < others.length; i++) {
      const pos = currentLayout.get(others[i].id);
      if (!pos) continue;
      const px = wPx(others[i], pos, dragGeom);
      const cx = px.left + px.width / 2;
      const cy = px.top + px.height / 2;
      const d = (pointerX - cx) ** 2 + (pointerY - cy) ** 2;
      if (d < bestDist) {
        bestDist = d;
        // Bias toward "after" when the pointer is anywhere near the center,
        // so dropping onto a widget reliably moves the dragged item past it.
        const before = pointerY < cy - px.height * 0.2 ||
          (Math.abs(pointerY - cy) <= px.height * 0.5 && pointerX < cx - px.width * 0.2);
        best = i + (before ? 0 : 1);
      }
    }
    return Math.max(0, Math.min(others.length, best));
  }

  function _updateDropTarget(e) {
    const pointerX = e.clientX - dragCanvasRect.left;
    const pointerY = e.clientY - dragCanvasRect.top;
    const others = state.widgets.filter(w => w.id !== wdata.id);
    const target = _findInsertIndex(pointerX, pointerY, others);
    dragTargetIndex = target;

    // Show where the widget will land in the new order.
    const next = others.slice();
    next.splice(target, 0, wdata);
    const nextLayout = computeDenseLayout(next, dragGeom);
    const slot = nextLayout.get(wdata.id);
    const marker = _dropMarker();
    if (marker && slot) {
      const px = wPx(wdata, slot, dragGeom);
      marker.style.display = 'block';
      marker.classList.add('show');
      marker.style.left = px.left + 'px';
      marker.style.top = px.top + 'px';
      marker.style.width = px.width + 'px';
      marker.style.height = px.height + 'px';
    }
  }

  function processMove() {
    dragRAF = 0;
    const e = pendingMove;
    if (!e || e.pointerId !== dragPointer) return;
    const dx = e.clientX - downX, dy = e.clientY - downY;

    if (!dragStarted) {
      if (dx*dx + dy*dy < 36) return;
      dragStarted = true;
      el._wasDragged = true;
      stopWLP();
      dragging = true;
      el.classList.remove('enter');
      el.classList.add('dragging');
      document.body.classList.add('any-dragging');
      // Capture only once this is a real drag, so clicks keep their target.
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
    }
    if (!dragging) return;

    el.style.translate = `${dx}px ${dy}px`;
    _updateDropTarget(e);
  }

  function _applyOrder(target) {
    const others = state.widgets.filter(w => w.id !== wdata.id);
    const next = others.slice();
    next.splice(Math.max(0, Math.min(others.length, target)), 0, wdata);
    state.widgets = next;
  }

  function endDrag(e) {
    if (e.pointerId !== dragPointer) return;
    if (dragRAF) { cancelAnimationFrame(dragRAF); dragRAF = 0; }
    stopWLP();

    const totalDist = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (totalDist >= 6) el._wasDragged = true;
    const target = dragTargetIndex;

    endDragGesture(e.pointerId);

    if (!dragging) {
      // Clean click. Link widgets navigate here because we don't prevent the
      // compatibility click.
      if (isLink && !el._wasDragged && !editMode) {
        window.open(wdata.config.url, '_blank', 'noopener,noreferrer');
      }
      // A swipe in normal mode has no action, but must suppress the late
      // click (weather/todo/pomodoro handlers check _wasDragged).
      if (el._wasDragged) setTimeout(() => { el._wasDragged = false; }, 300);
      else el._wasDragged = false;
      dragStarted = false;
      return;
    }

    dragging = false; dragStarted = false;
    hideDropMarker();
    el.style.translate = '';

    _applyOrder(target < 0 ? state.widgets.indexOf(wdata) : target);
    debouncedSaveState();

    // While `.dragging` is still on (its transition only covers box-shadow),
    // snap the element to the new slot so it doesn't animate from the old
    // position. Other widgets then animate to their new slots.
    const geom = readGeom();
    const layout = computeDenseLayout(state.widgets, geom);
    const pos = layout.get(wdata.id);
    if (pos) {
      const px = wPx(wdata, pos, geom);
      el.style.left = px.left + 'px'; el.style.top = px.top + 'px';
      el.style.width = px.width + 'px'; el.style.height = px.height + 'px';
      el.style.zIndex = 10;
    }
    document.body.classList.remove('any-dragging');
    el.classList.remove('dragging');
    setTimeout(() => { el._wasDragged = false; }, 300);
    positionAll();
  }

  function cancelDrag(e) {
    if (e.pointerId !== dragPointer) return;
    stopWLP();
    if (dragRAF) { cancelAnimationFrame(dragRAF); dragRAF = 0; }
    endDragGesture(e.pointerId);
    if (dragging) {
      dragging = false; dragStarted = false;
      el.classList.remove('dragging');
      el.style.translate = '';
      document.body.classList.remove('any-dragging');
      hideDropMarker();
      positionAll();
    }
    el._wasDragged = false;
  }

  el.addEventListener('pointerdown', beginDrag);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', cancelDrag);
  el.addEventListener('lostpointercapture', e => { if (e.pointerId === dragPointer) cancelDrag(e); });
  el.addEventListener('pointerleave', () => {
    if (dragPointer != null && !dragging) {
      stopWLP();
      endDragGesture(dragPointer);
      dragStarted = false;
      if (el._wasDragged) setTimeout(() => { el._wasDragged = false; }, 300);
    }
  });

  /* ────────── RESIZE — bottom-right handle, grid-snapped ────────── */
  el.querySelectorAll('.rh').forEach(handle => {
    let resizePointer = null;
    let rsX = 0, rsY = 0, rsW = 0, rsH = 0, rsLeft = 0, rsTop = 0, rsColX = 0;
    let rsGeom = null, rsRAF = 0, rsPending = null;

    function endResize(pointerId) {
      if (rsRAF) { cancelAnimationFrame(rsRAF); rsRAF = 0; }
      rsPending = null;
      if (pointerId != null) {
        try { handle.releasePointerCapture(pointerId); } catch (_) {}
      }
      resizePointer = null;
    }

    handle.addEventListener('pointerdown', e => {
      if (!editMode || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      resizePointer = e.pointerId;
      rsGeom = readGeom();
      rsX = e.clientX; rsY = e.clientY;
      rsW = wdata.w; rsH = wdata.h;
      rsLeft = el.offsetLeft; rsTop = el.offsetTop;
      rsColX = Math.round(rsLeft / (rsGeom.colW + GAP));
      el.classList.add('resizing');
      document.body.classList.add('resizing');
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    });

    handle.addEventListener('pointermove', e => {
      if (e.pointerId !== resizePointer) return;
      rsPending = e;
      if (rsRAF) return;
      rsRAF = requestAnimationFrame(processResizeMove);
    });

    function processResizeMove() {
      rsRAF = 0;
      const e = rsPending;
      if (!e || e.pointerId !== resizePointer) return;

      const dCol = Math.round((e.clientX - rsX) / (rsGeom.colW + GAP));
      const dRow = Math.round((e.clientY - rsY) / (rsGeom.rowH + GAP));
      const rules = SIZE_RULES[wdata.type] || { minW:1, minH:1, maxW:rsGeom.vc, maxH:20 };
      const maxW = Math.min(rules.maxW, rsGeom.vc - rsColX);
      const newW = Math.max(rules.minW, Math.min(maxW, rsW + dCol));
      let newH = Math.max(rules.minH, Math.min(rules.maxH, rsH + dRow));
      const ratio = ASPECT_LOCK[wdata.type];
      if (ratio) newH = Math.max(rules.minH, Math.min(rules.maxH, Math.round(newW / ratio)));
      wdata.w = newW;
      wdata.h = newH;

      // Keep the top-left fixed while dragging the handle; the dense layout
      // re-flows every widget (and fills the freed space) on release.
      const cols = Math.min(wdata.w, rsGeom.vc);
      const px = wPx(wdata, {
        x: rsColX, y: rsTop, w: cols, h: itemHeight(wdata, cols, rsGeom),
      }, rsGeom);
      el.style.left = rsLeft + 'px';
      el.style.top = rsTop + 'px';
      el.style.width = px.width + 'px';
      el.style.height = px.height + 'px';
    }

    function finishResize(e) {
      if (e.pointerId !== resizePointer) return;
      const vc = rsGeom ? rsGeom.vc : undefined;
      endResize(e.pointerId);
      el.classList.remove('resizing');
      document.body.classList.remove('resizing');
      clampSize(wdata, vc);
      debouncedSaveState();
      positionAll();
    }

    handle.addEventListener('pointerup', finishResize);
    handle.addEventListener('pointercancel', finishResize);
    handle._unbind = () => endResize(resizePointer);
  });

  // _unbindDrag clears gesture state when the widget is removed.
  el._unbindDrag = () => {
    stopWLP();
    endDragGesture(dragPointer);
    hideDropMarker();
    el.querySelectorAll('.rh').forEach(h => h._unbind?.());
  };

  return el;
}

function addWidget(wdata) {
  const geom = readGeom();
  clampSize(wdata, geom.vc);
  state.widgets.push(wdata); // order controls placement; new widgets go last
  saveState();

  const layout = computeDenseLayout(state.widgets, geom);
  const canvas = document.getElementById('grid-canvas');
  const el = makeWidget(wdata, null, geom, layout.get(wdata.id));
  if (el) canvas.appendChild(el);
  positionAll();
  updateEmptyHint();
}

// Confirmation (if any) is the caller's responsibility — this function
// always removes immediately.
function removeWidget(id) {
  const el = document.querySelector(`.widget[data-id="${id}"]`);
  if (el) { cleanupWidget(id); el._unbindDrag?.(); el.style.opacity='0'; el.style.transform='scale(.88)'; el.style.transition='all .2s'; setTimeout(()=>el.remove(),200); }
  // Clean up any stored custom image for this link widget
  localStorage.removeItem('dash_limg_' + id);
  state.widgets = state.widgets.filter(w=>w.id!==id);
  saveState();
  positionAll();
  updateEmptyHint();
}

// Rebuild one widget in place (link edit, etc.) without destroying/touching
// every other widget. Keeps iframes loaded, pomodoro running, calendar view.
function renderWidget(id) {
  const wdata = state.widgets.find(w => w.id === id);
  if (!wdata) return;
  const canvas = document.getElementById('grid-canvas');
  const old = canvas.querySelector(`.widget[data-id="${id}"]`);
  const geom = readGeom();
  const layout = computeDenseLayout(state.widgets, geom);
  cleanupWidget(id);
  if (old) { old._unbindDrag?.(); old.remove(); }
  const el = makeWidget(wdata, null, geom, layout.get(id));
  if (el) canvas.appendChild(el);
  positionAll();
}

function renderAll() {
  const canvas = document.getElementById('grid-canvas');
  canvas.querySelectorAll('.widget').forEach(el=>{ cleanupWidget(el.dataset.id); el._unbindDrag?.(); el.remove(); });

  const geom = readGeom();
  const layout = computeDenseLayout(state.widgets, geom);

  let bottom = 0;
  for (const pos of layout.values()) bottom = Math.max(bottom, pos.y + pos.h);
  const outer = document.getElementById('grid-outer');
  canvas.style.minHeight = Math.max(bottom + GAP * 2, outer.clientHeight - 40) + 'px';

  const frag = document.createDocumentFragment();
  state.widgets.forEach(w => {
    const el = makeWidget(w, null, geom, layout.get(w.id));
    if (el) frag.appendChild(el);
  });
  canvas.appendChild(frag);
  updateEmptyHint();
  if (editMode) buildGridBg();
}

function updateEmptyHint() {
  document.getElementById('empty-hint').style.opacity = state.widgets.length ? '0' : '1';
}

/**
 * positionAll — update only CSS positions of existing widget elements.
 * No DOM teardown/rebuild → no flash. Used after drag-drop.
 */
let _positionRAF = 0;
function positionAll() {
  if (_positionRAF) return;
  _positionRAF = requestAnimationFrame(() => {
    _positionRAF = 0;
    const canvas = document.getElementById('grid-canvas');
    const geom = readGeom();
    const outer = document.getElementById('grid-outer');

    // Read phase: one element map, one outer-height read, all rectangles.
    const els = new Map([...canvas.querySelectorAll('.widget')].map(el => [el.dataset.id, el]));
    const layout = computeDenseLayout(state.widgets, geom);
    let bottom = 0;
    for (const pos of layout.values()) bottom = Math.max(bottom, pos.y + pos.h);
    const minHeight = Math.max(bottom + GAP * 2, outer.clientHeight - 40);
    const placements = [];
    state.widgets.forEach((w, index) => {
      const pos = layout.get(w.id);
      const el = els.get(w.id);
      if (!pos || !el || el.classList.contains('dragging') || el.classList.contains('resizing')) return;
      placements.push({ el, px: wPx(w, pos, geom), z: 10 + index });
    });

    // Write phase: no layout reads once writes begin.
    canvas.style.minHeight = minHeight + 'px';
    for (const { el, px, z } of placements) {
      el.style.left   = px.left   + 'px';
      el.style.top    = px.top    + 'px';
      el.style.width  = px.width  + 'px';
      el.style.height = px.height + 'px';
      el.style.zIndex = z;
    }
  });
}

// Reflow when #grid-outer's rendered size changes. A ResizeObserver on the
// element itself (rather than a `window` "resize" listener) is what catches
// browser page-zoom changes reliably.
let resizeTimer;
const _initialOuter = document.getElementById('grid-outer');
let _lastGeom = { ...readGeom(), h: _initialOuter ? _initialOuter.clientHeight : 0 };
function scheduleReflow() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const geom = readGeom();
    const outer = document.getElementById('grid-outer');
    const h = outer ? outer.clientHeight : 0;
    const colsChanged = geom.vc !== _lastGeom.vc;
    if (geom.gw === _lastGeom.gw && !colsChanged && h === _lastGeom.h) return; // initial callback / no-op
    _lastGeom = { ...geom, h };
    document.body.classList.add('reflowing');
    if (editMode) buildGridBg();
    positionAll();
    requestAnimationFrame(() => document.body.classList.remove('reflowing'));
  }, 120);
}
window.addEventListener('resize', scheduleReflow);
window.addEventListener('beforeunload', () => clearTimeout(resizeTimer), { once: true });
if (typeof ResizeObserver !== 'undefined') {
  const gridOuterEl = document.getElementById('grid-outer');
  if (gridOuterEl) new ResizeObserver(scheduleReflow).observe(gridOuterEl);
}
