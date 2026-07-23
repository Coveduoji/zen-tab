/* ═══════════════════════════════════════════════════════
   WIDGET INSTANCE MANAGER
   ═══════════════════════════════════════════════════════ */

// Single pair of document-level listeners shared by all widgets (drag + resize).
// Each mousedown registers its own handlers; mouseup clears them automatically.
let _docMoveH = null, _docUpH = null;
document.addEventListener('mousemove', e => _docMoveH?.(e));
document.addEventListener('mouseup',   e => { _docUpH?.(e); _docMoveH = null; _docUpH = null; });

function saveWCfg(id, cfg) {
  const w = state.widgets.find(w=>w.id===id);
  if (w) { w.config=cfg; saveState(); }
}

function makeWidget(wdata, layoutOverrides) {
  const def = REG[wdata.type];
  if (!def) return null;
  clamp(wdata);
  const px = wPxResponsive(wdata, layoutOverrides);

  const el = document.createElement('div');
  el.className = 'widget';
  el.dataset.id = wdata.id;
  el.dataset.type = wdata.type;
  el.style.cssText = `left:${px.left}px;top:${px.top}px;width:${px.width}px;height:${px.height}px;z-index:${10+wdata.y};`;

  const isLink = wdata.type === 'link';
  const titleText = isLink ? (wdata.config.name || def.name) : def.name;

  const wR = 28; const wC = 2*Math.PI*wR;
  el.innerHTML = `
    <div class="w-del-badge" title="Delete">−</div>
    ${isLink
      ? `<div class="w-controls" style="position:absolute;top:4px;right:4px;z-index:10;display:flex;gap:2px;opacity:0;transition:opacity var(--t)"></div>`
      : `<div class="w-header">
      <div class="w-title"><span class="ico">${def.icon}</span><span>${titleText}</span></div>
      <div class="w-controls" style="display:flex;gap:3px;opacity:0;transition:opacity var(--t)"></div>
    </div>`}
    <div class="w-body"></div>
    <div class="w-resize-handles">
      <div class="rh nw" data-dir="nw"></div>
      <div class="rh ne" data-dir="ne"></div>
      <div class="rh sw" data-dir="sw"></div>
      <div class="rh se" data-dir="se"></div>
    </div>
    <div class="w-lp-ring" id="wlpr-${wdata.id}">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle class="wlp-track" cx="32" cy="32" r="${wR}" stroke-width="3"/>
        <circle class="wlp-fill" cx="32" cy="32" r="${wR}" stroke-width="3"
          stroke-dasharray="${wC.toFixed(1)}" stroke-dashoffset="${wC.toFixed(1)}" id="wlpf-${wdata.id}"/>
      </svg>
    </div>`;

  // Show controls on hover (normal mode) — both link and non-link
  el.addEventListener('mouseenter', () => { if (!editMode) el.querySelector('.w-controls')?.style.setProperty('opacity','1'); });
  el.addEventListener('mouseleave', () => { el.querySelector('.w-controls')?.style.setProperty('opacity','0'); });

  // Right-click context menu
  el.addEventListener('contextmenu', e => openCtxMenu(e, wdata.id));

  // Delete badge
  el.querySelector('.w-del-badge').addEventListener('click', e => {
    e.stopPropagation();
    removeWidget(wdata.id);
    toast(t('widget_removed'), '');
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
  {
    const WLP_DUR = 650;
    let wlpTimer = null, wlpStart = null, wlpX = 0, wlpY = 0;
    const ringEl = document.getElementById(`wlpr-${wdata.id}`);
    const fillEl = document.getElementById(`wlpf-${wdata.id}`);
    const WC_VAL = 2 * Math.PI * 28;

    function startWLP(e) {
      if (editMode) return;
      if (e.target.closest('.w-del-badge') || e.target.closest('.rh')) return;
      if (e.button !== 0 && e.type === 'mousedown') return;
      wlpX = e.clientX; wlpY = e.clientY;
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
    }
    function stopWLP() {
      if (wlpTimer) { cancelAnimationFrame(wlpTimer); wlpTimer = null; }
      if (ringEl) { ringEl.style.display='none'; if(fillEl){fillEl.style.opacity='0';} }
      wlpStart = null;
    }
    el.addEventListener('mousedown', startWLP);
    el.addEventListener('mouseup',   stopWLP);
    el.addEventListener('mouseleave',stopWLP);
    // Cancel long-press if user starts dragging (>5px)
    el.addEventListener('mousemove', e => {
      if (wlpTimer && (Math.abs(e.clientX-wlpX)+Math.abs(e.clientY-wlpY) > 5)) stopWLP();
    });
  }

  /* ────────── DRAG — 6px threshold, click/drag strictly separated ────────── */
  let dragging=false, dragStarted=false, offX=0, offY=0, ghost=null, origX=0, origY=0, downX=0, downY=0;
  // Grid geometry + canvas rect cached once per drag session (mousedown) —
  // they don't change mid-drag, so avoid a forced-reflow clientWidth read
  // on every mousemove. Pending pointer events are coalesced into a single
  // rAF-batched write per frame instead of writing styles synchronously
  // on each mousemove.
  let dragVc=0, dragColW=0, dragGw=0, dragRowH=0, dragCanvasRect=null;
  let dragRAF=null, pendingMoveEvent=null;

  el.addEventListener('mousedown', e => {
    if (e.target.closest('.rh') || e.target.closest('.w-del-badge')) return;
    if (e.button !== 0) return;
    e.preventDefault();   // always preventDefault — blocks <a> native nav for all widget types
    e.stopPropagation();

    dragging = false; dragStarted = false;
    el._wasDragged = false;   // reset on every fresh press
    origX = wdata.x; origY = wdata.y;
    downX = e.clientX; downY = e.clientY;
    const rect = el.getBoundingClientRect();
    offX = e.clientX - rect.left;
    offY = e.clientY - rect.top;
    dragVc = visibleCols();
    dragColW = cw();
    dragGw = gw();
    dragRowH = rowH();
    dragCanvasRect = document.getElementById('grid-canvas').getBoundingClientRect();
    _docMoveH = onMove; _docUpH = onUp;
  });

  function onMove(e) {
    if (downX === 0 && downY === 0) return;
    pendingMoveEvent = e;
    if (dragRAF) return;
    dragRAF = requestAnimationFrame(processMove);
  }

  function processMove() {
    dragRAF = null;
    const e = pendingMoveEvent;
    if (!e) return;

    const dx = e.clientX - downX, dy = e.clientY - downY;

    if (!dragStarted) {
      if (Math.sqrt(dx*dx + dy*dy) < 6) return;
      dragStarted = true;
      dragging = true;
      el._wasDragged = true;   // set as soon as threshold crossed
      el.classList.add('dragging');
      el.style.transition = 'none';
      el.style.zIndex = 500;
      document.body.classList.add('any-dragging');

      ghost = document.getElementById('drop-ghost');
      ghost.style.display = 'block';
      ghost.className = 'drop-ghost valid';
      const curPx = wPxResponsive(wdata, null, { colW: dragColW, vc: dragVc, rowH: dragRowH });
      ghost.style.cssText = `display:block;left:${curPx.left}px;top:${curPx.top}px;width:${curPx.width}px;height:${curPx.height}px;`;
    }

    if (!dragging) return;
    let nx = e.clientX - dragCanvasRect.left - offX;
    let ny = e.clientY - dragCanvasRect.top  - offY;

    const vc = dragVc, colW = dragColW;
    const pw = Math.min(wdata.w, vc) * colW + (Math.min(wdata.w,vc)-1)*GAP;
    const ph = (wdata.type === 'link' || wdata.type === 'pomodoro') ? pw : wdata.h * dragRowH + (wdata.h-1)*GAP;
    nx = Math.max(0, Math.min(dragGw - pw, nx));
    ny = Math.max(0, ny);

    el.style.left = nx + 'px';
    el.style.top  = ny + 'px';

    // 两种模式都对齐网格格子，ghost 始终显示网格落点
    // 用实际渲染宽度（不超过 vc）计算 snap 上限
    const renderW = Math.min(wdata.w, vc);
    const snapCol = Math.max(0, Math.min(vc - renderW, Math.round(nx/(colW+GAP))));
    const snapRow = Math.max(0, Math.round(ny/(dragRowH+GAP)));
    const ghostRect = { id:'__ghost__', x:snapCol, y:snapRow, w:renderW, h:wdata.h };
    const hits = getCollisions(ghostRect, wdata.id, state.widgets);
    ghost.className = 'drop-ghost ' + (hits.length===0 ? 'valid' : 'invalid');
    const gpx = { left: snapCol*(colW+GAP), top: snapRow*(dragRowH+GAP), width: pw, height: ph };
    ghost.style.left   = gpx.left   + 'px';
    ghost.style.top    = gpx.top    + 'px';
    ghost.style.width  = gpx.width  + 'px';
    ghost.style.height = gpx.height + 'px';
    wdata._snapX = snapCol; wdata._snapY = snapRow;
  }

  function onUp(e) {
    if (downX === 0 && downY === 0) return;
    if (dragRAF) { cancelAnimationFrame(dragRAF); dragRAF = null; }

    // Final distance check: even if mousemove never fired (fast tap+release),
    // measure here and mark as dragged if moved beyond threshold.
    const totalDist = Math.sqrt(
      Math.pow(e.clientX - downX, 2) + Math.pow(e.clientY - downY, 2)
    );
    if (totalDist >= 6) el._wasDragged = true;

    downX = 0; downY = 0;

    if (!dragging) {
      dragStarted = false;
      // Not a drag — this is a clean click.
      // For link widgets: fire the navigation now (since mousedown did preventDefault)
      if (isLink && !el._wasDragged && !editMode) {
        window.open(wdata.config.url, '_blank', 'noopener,noreferrer');
      }
      el._wasDragged = false;
      return;
    }

    dragging = false; dragStarted = false;
    el.classList.remove('dragging');
    // Suppress transition on the dragged element so it snaps instantly to the
    // grid position without an animation "bounce". Other widgets pushed by
    // compact() keep their transitions and slide smoothly.
    el.style.transition = 'none';
    document.body.classList.remove('any-dragging');

    if (ghost) { ghost.style.display = 'none'; ghost = null; }

    // Keep _wasDragged=true briefly to suppress any late-firing click event
    setTimeout(() => { el._wasDragged = false; }, 300);

    const newX = wdata._snapX ?? origX;
    const newY = wdata._snapY ?? origY;
    wdata.x = newX; wdata.y = newY;
    delete wdata._snapX; delete wdata._snapY;
    // Restore the row-based stacking order (same formula makeWidget() uses
    // at creation) instead of clearing z-index — otherwise a widget that
    // was just dragged permanently falls behind never-dragged siblings.
    el.style.zIndex = 10 + wdata.y;

    pushDown(wdata, state.widgets);
    if (state.settings.compactMode !== false) compact(state.widgets);
    clamp(wdata, dragVc);
    debouncedSaveState();
    positionAll(); // only update CSS positions — no DOM teardown → no flash
  }

  // _unbindDrag clears singleton handlers (if this widget owns them) and resize handles
  el._unbindDrag = () => {
    if (_docMoveH === onMove) { _docMoveH = null; _docUpH = null; }
    if (dragRAF) { cancelAnimationFrame(dragRAF); dragRAF = null; }
    el.querySelectorAll('.rh').forEach(h => h._unbind?.());
  };

  /* ────────── RESIZE ────────── */
  el.querySelectorAll('.rh').forEach(handle => {
    let resizing=false, rsX=0, rsY=0, rsW=0, rsH=0, rsColX=0, rsRowY=0;
    // Same idea as drag: cache grid geometry once per resize session and
    // batch style writes into a single rAF per frame.
    let rsGeom=null, rsRAF=null, rsPendingEvent=null;
    const dir = handle.dataset.dir;

    handle.addEventListener('mousedown', e => {
      if (!editMode) return;
      e.preventDefault(); e.stopPropagation();
      resizing=true; rsX=e.clientX; rsY=e.clientY;
      rsW=wdata.w; rsH=wdata.h;
      rsColX=wdata.x; rsRowY=wdata.y;
      rsGeom = { colW: cw(), vc: visibleCols(), rowH: rowH() };
      el.style.transition='none';
      _docMoveH = onResizeMove; _docUpH = onResizeUp;
    });

    function onResizeMove(e) {
      if (!resizing) return;
      rsPendingEvent = e;
      if (rsRAF) return;
      rsRAF = requestAnimationFrame(processResizeMove);
    }

    function processResizeMove() {
      rsRAF = null;
      const e = rsPendingEvent;
      if (!e || !resizing) return;
      const colW = rsGeom.colW;
      const dCol = Math.round((e.clientX-rsX)/(colW+GAP));
      const dRow = Math.round((e.clientY-rsY)/(rsGeom.rowH+GAP));
      // Bound to this session's cached visible-column count (rsGeom.vc), not
      // the full model width — resizing a widget past what's actually on
      // screen is exactly what let render's display-only clamp stack it on
      // top of something else (see tidyLayout's history).
      const rules = SIZE_RULES[wdata.type]||{minW:1,minH:1,maxW:rsGeom.vc,maxH:20};

      if (dir==='se') { wdata.w=Math.max(rules.minW,Math.min(rules.maxW,rsGeom.vc-wdata.x,rsW+dCol)); wdata.h=Math.max(rules.minH,Math.min(rules.maxH,rsH+dRow)); }
      else if (dir==='sw') {
        const newW=Math.max(rules.minW,Math.min(rules.maxW,rsW-dCol));
        const newX=Math.max(0,rsColX+(rsW-newW));
        wdata.w=newW; wdata.x=newX; wdata.h=Math.max(rules.minH,Math.min(rules.maxH,rsH+dRow));
      } else if (dir==='ne') {
        const newH=Math.max(rules.minH,Math.min(rules.maxH,rsH-dRow));
        wdata.y=Math.max(0,rsRowY+(rsH-newH)); wdata.h=newH;
        wdata.w=Math.max(rules.minW,Math.min(rules.maxW,rsGeom.vc-wdata.x,rsW+dCol));
      } else if (dir==='nw') {
        const newW=Math.max(rules.minW,Math.min(rules.maxW,rsW-dCol));
        const newH=Math.max(rules.minH,Math.min(rules.maxH,rsH-dRow));
        wdata.x=Math.max(0,rsColX+(rsW-newW)); wdata.y=Math.max(0,rsRowY+(rsH-newH));
        wdata.w=newW; wdata.h=newH;
      }

      // Aspect-locked types (link/pomodoro square, weather/clock 3:2, ...):
      // derive the non-driving side from whichever dimension this handle
      // moves most directly, instead of letting w/h resize independently.
      const ratio = ASPECT_LOCK[wdata.type];
      if (ratio) {
        let newW, newH;
        if (dir==='ne'||dir==='nw') {
          newH = Math.max(rules.minH, Math.min(rules.maxH, wdata.h));
          newW = Math.max(rules.minW, Math.min(rules.maxW, Math.round(newH * ratio)));
        } else {
          newW = Math.max(rules.minW, Math.min(rules.maxW, wdata.w));
          newH = Math.max(rules.minH, Math.min(rules.maxH, Math.round(newW / ratio)));
        }
        if (dir==='nw'||dir==='sw') wdata.x = Math.max(0, rsColX+(rsW-newW));
        if (dir==='nw'||dir==='ne') wdata.y = Math.max(0, rsRowY+(rsH-newH));
        wdata.w = newW; wdata.h = newH;
      }

      const px = wPxResponsive(wdata, null, rsGeom);
      el.style.left=px.left+'px'; el.style.top=px.top+'px';
      el.style.width=px.width+'px'; el.style.height=px.height+'px';
    }

    function onResizeUp() {
      if (!resizing) return; resizing=false;
      if (rsRAF) { cancelAnimationFrame(rsRAF); rsRAF = null; }
      el.style.transition='';
      pushDown(wdata, state.widgets);
      if (state.settings.compactMode !== false) compact(state.widgets);
      clamp(wdata, rsGeom.vc); debouncedSaveState();
      positionAll(); // resize never adds/removes widgets — no need for a full renderAll()
    }

    handle._unbind = () => {
      if (_docMoveH === onResizeMove) { _docMoveH = null; _docUpH = null; }
      if (rsRAF) { cancelAnimationFrame(rsRAF); rsRAF = null; }
    };
  });

  return el;
}

function addWidget(wdata) {
  clamp(wdata);
  // Ensure no collision before adding
  const hits = getCollisions(wdata, wdata.id, state.widgets);
  if (hits.length > 0) {
    const slot = findFreeSlot(wdata.w, wdata.h, state.widgets);
    wdata.x = slot.x; wdata.y = slot.y;
  }
  state.widgets.push(wdata);
  if (state.settings.compactMode !== false) compact(state.widgets);
  saveState();

  // Only the new widget needs a fresh DOM node — everything else that
  // compact() may have shifted just needs repositioning, not a full rebuild.
  const canvas = document.getElementById('grid-canvas');
  const el = makeWidget(wdata, null);
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
  if (state.settings.compactMode !== false) compact(state.widgets);
  saveState();
  updateEmptyHint();
}

function renderAll() {
  const canvas = document.getElementById('grid-canvas');
  canvas.querySelectorAll('.widget').forEach(el=>{ cleanupWidget(el.dataset.id); el._unbindDrag?.(); el.remove(); });

  // computeResponsiveLayout() always returns null (reserved for future responsive mode)
  const layoutOverrides = null;

  // Compute canvas height from the effective (possibly overridden) layout
  let maxRow = 0;
  state.widgets.forEach(w => {
    const ov = layoutOverrides && layoutOverrides[w.id];
    const effY = ov ? ov.y : w.y;
    maxRow = Math.max(maxRow, effY + w.h);
  });
  canvas.style.minHeight = Math.max(ry(maxRow+2), document.getElementById('grid-outer').clientHeight-40) + 'px';

  const frag = document.createDocumentFragment();
  state.widgets.forEach(w => {
    const el = makeWidget(w, layoutOverrides);
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
function positionAll() {
  const canvas = document.getElementById('grid-canvas');
  const layoutOverrides = null;

  // Recalculate canvas height (read phase — before any writes)
  let maxRow = 0;
  state.widgets.forEach(w => {
    const ov = layoutOverrides && layoutOverrides[w.id];
    const effY = ov ? ov.y : w.y;
    maxRow = Math.max(maxRow, effY + w.h);
  });

  // Batch all DOM writes in a single rAF to avoid layout thrashing
  requestAnimationFrame(() => {
    canvas.style.minHeight = Math.max(ry(maxRow+2), document.getElementById('grid-outer').clientHeight-40) + 'px';
    state.widgets.forEach(w => {
      const el = canvas.querySelector(`.widget[data-id="${w.id}"]`);
      if (!el || el.classList.contains('dragging')) return;
      const px = wPxResponsive(w, layoutOverrides);
      el.style.left   = px.left   + 'px';
      el.style.top    = px.top    + 'px';
      el.style.width  = px.width  + 'px';
      el.style.height = px.height + 'px';
      // Keep stacking order in sync with the new row — otherwise a widget
      // that moved to a different row keeps its old row's z-index and can
      // render on top of/behind the wrong sibling while they slide past
      // each other in this reflow's transition.
      el.style.zIndex = 10 + w.y;
    });
  });
}

// Reflow when #grid-outer's rendered size changes. A ResizeObserver on the
// element itself (rather than a `window` "resize" listener) is what catches
// browser page-zoom changes reliably — zooming resizes #grid-outer's actual
// box, but doesn't consistently fire a window resize event, which used to
// leave every widget positioned for the pre-zoom width: at a wider zoomed-in
// render, that stale layout no longer fit and produced horizontal overflow.
let resizeTimer;
function scheduleReflow() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { normalizeToVc(); buildGridBg(); positionAll(); }, 120);
}
window.addEventListener('resize', scheduleReflow);
window.addEventListener('beforeunload', () => clearTimeout(resizeTimer), { once: true });
if (typeof ResizeObserver !== 'undefined') {
  const gridOuterEl = document.getElementById('grid-outer');
  if (gridOuterEl) new ResizeObserver(scheduleReflow).observe(gridOuterEl);
}
