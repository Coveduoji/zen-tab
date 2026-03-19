/* ═══════════════════════════════════════════════════════
   WIDGET INSTANCE MANAGER
   ═══════════════════════════════════════════════════════ */

// Single pair of document-level listeners shared by all widgets (drag + resize).
// Each mousedown registers its own handlers; mouseup clears them automatically.
let _docMoveH = null, _docUpH = null;

// Display-only layout overrides used when the window is too narrow to fit the
// stored layout. Does NOT mutate state — cleared automatically when vc grows
// back. Committed to state permanently when the user starts dragging/resizing.
let _flowOverrides = null;

// Commit any active flow overrides to state so drag/resize always start from
// a clean, collision-free position.
function _commitFlowOverrides() {
  if (!_flowOverrides) return;
  state.widgets.forEach(w => {
    const ov = _flowOverrides[w.id];
    if (ov) { w.x = ov.x; w.y = ov.y; w.w = ov.w; }
  });
  _flowOverrides = null;
  debouncedSaveState();
}
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
      if (e.target.closest('.rh')) return;
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

  el.addEventListener('mousedown', e => {
    if (e.target.closest('.rh')) return;
    if (e.button !== 0) return;
    e.preventDefault();   // always preventDefault — blocks <a> native nav for all widget types
    e.stopPropagation();

    // Commit any display-only responsive overrides so drag starts from real positions
    _commitFlowOverrides();

    dragging = false; dragStarted = false;
    el._wasDragged = false;   // reset on every fresh press
    origX = wdata.x; origY = wdata.y;
    downX = e.clientX; downY = e.clientY;
    const rect = el.getBoundingClientRect();
    offX = e.clientX - rect.left;
    offY = e.clientY - rect.top;
    _docMoveH = onMove; _docUpH = onUp;
  });

  function onMove(e) {
    if (downX === 0 && downY === 0) return;

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
      const curPx = wPxResponsive(wdata, _flowOverrides);
      ghost.style.cssText = `display:block;left:${curPx.left}px;top:${curPx.top}px;width:${curPx.width}px;height:${curPx.height}px;`;
    }

    if (!dragging) return;
    const canvasRect = document.getElementById('grid-canvas').getBoundingClientRect();
    let nx = e.clientX - canvasRect.left - offX;
    let ny = e.clientY - canvasRect.top  - offY;

    const vc = visibleCols();
    const colW = cw();
    const pw = Math.min(wdata.w, vc) * colW + (Math.min(wdata.w,vc)-1)*GAP;
    const ph = (wdata.type === 'link' || wdata.type === 'pomodoro') ? pw : wdata.h * rowH() + (wdata.h-1)*GAP;
    nx = Math.max(0, Math.min(gw() - pw, nx));
    ny = Math.max(0, ny);

    el.style.left = nx + 'px';
    el.style.top  = ny + 'px';

    // 两种模式都对齐网格格子，ghost 始终显示网格落点
    // 用实际渲染宽度（不超过 vc）计算 snap 上限
    const renderW = Math.min(wdata.w, vc);
    const snapCol = Math.max(0, Math.min(vc - renderW, Math.round(nx/(colW+GAP))));
    const snapRow = Math.max(0, Math.round(ny/(rowH()+GAP)));
    const ghostRect = { id:'__ghost__', x:snapCol, y:snapRow, w:renderW, h:wdata.h };
    const hits = getCollisions(ghostRect, wdata.id, state.widgets);
    ghost.className = 'drop-ghost ' + (hits.length===0 ? 'valid' : 'invalid');
    const gpx = { left: snapCol*(colW+GAP), top: snapRow*(rowH()+GAP), width: pw, height: ph };
    ghost.style.left   = gpx.left   + 'px';
    ghost.style.top    = gpx.top    + 'px';
    ghost.style.width  = gpx.width  + 'px';
    ghost.style.height = gpx.height + 'px';
    wdata._snapX = snapCol; wdata._snapY = snapRow;
  }

  function onUp(e) {
    if (downX === 0 && downY === 0) return;

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
      if (!el._wasDragged) {
        // In edit mode: toggle multi-select
        if (editMode) {
          toggleWidgetSelection(wdata.id);
        } else if (isLink) {
          // Normal mode: fire link navigation (mousedown did preventDefault)
          window.open(wdata.config.url, '_blank', 'noopener,noreferrer');
        }
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
    el.style.zIndex = '';
    document.body.classList.remove('any-dragging');

    if (ghost) { ghost.style.display = 'none'; ghost = null; }

    // Keep _wasDragged=true briefly to suppress any late-firing click event
    setTimeout(() => { el._wasDragged = false; }, 300);

    const newX = wdata._snapX ?? origX;
    const newY = wdata._snapY ?? origY;
    wdata.x = newX; wdata.y = newY;
    delete wdata._snapX; delete wdata._snapY;

    pushDown(wdata, state.widgets);
    clamp(wdata);
    debouncedSaveState();
    positionAll(); // only update CSS positions — no DOM teardown → no flash
  }

  // _unbindDrag clears singleton handlers (if this widget owns them) and resize handles
  el._unbindDrag = () => {
    if (_docMoveH === onMove) { _docMoveH = null; _docUpH = null; }
    el.querySelectorAll('.rh').forEach(h => h._unbind?.());
  };

  /* ────────── RESIZE ────────── */
  el.querySelectorAll('.rh').forEach(handle => {
    let resizing=false, rsX=0, rsY=0, rsW=0, rsH=0, rsColX=0, rsRowY=0;
    const dir = handle.dataset.dir;

    handle.addEventListener('mousedown', e => {
      if (!editMode) return;
      e.preventDefault(); e.stopPropagation();
      // Commit display-only overrides so resize starts from real positions
      _commitFlowOverrides();
      resizing=true; rsX=e.clientX; rsY=e.clientY;
      rsW=wdata.w; rsH=wdata.h;
      rsColX=wdata.x; rsRowY=wdata.y;
      el.style.transition='none';
      _docMoveH = onResizeMove; _docUpH = onResizeUp;
    });

    function onResizeMove(e) {
      if (!resizing) return;
      const colW = cw();
      const dCol = Math.round((e.clientX-rsX)/(colW+GAP));
      const dRow = Math.round((e.clientY-rsY)/(rowH()+GAP));
      const rules = SIZE_RULES[wdata.type]||{minW:1,minH:1,maxW:COLS,maxH:20};

      if (dir==='se') { wdata.w=Math.max(rules.minW,Math.min(rules.maxW,COLS-wdata.x,rsW+dCol)); wdata.h=Math.max(rules.minH,Math.min(rules.maxH,rsH+dRow)); }
      else if (dir==='sw') {
        const newW=Math.max(rules.minW,Math.min(rules.maxW,rsW-dCol));
        const newX=Math.max(0,rsColX+(rsW-newW));
        wdata.w=newW; wdata.x=newX; wdata.h=Math.max(rules.minH,Math.min(rules.maxH,rsH+dRow));
      } else if (dir==='ne') {
        const newH=Math.max(rules.minH,Math.min(rules.maxH,rsH-dRow));
        wdata.y=Math.max(0,rsRowY+(rsH-newH)); wdata.h=newH;
        wdata.w=Math.max(rules.minW,Math.min(rules.maxW,COLS-wdata.x,rsW+dCol));
      } else if (dir==='nw') {
        const newW=Math.max(rules.minW,Math.min(rules.maxW,rsW-dCol));
        const newH=Math.max(rules.minH,Math.min(rules.maxH,rsH-dRow));
        wdata.x=Math.max(0,rsColX+(rsW-newW)); wdata.y=Math.max(0,rsRowY+(rsH-newH));
        wdata.w=newW; wdata.h=newH;
      }

      // Pomodoro & link: enforce square (w === h)
      if (wdata.type === 'pomodoro' || wdata.type === 'link') {
        const sq = (dir==='ne'||dir==='nw') ? wdata.h : wdata.w;
        const sqClamped = Math.max(rules.minW, Math.min(rules.maxW, sq));
        if (dir==='nw'||dir==='sw') wdata.x = Math.max(0, rsColX+(rsW-sqClamped));
        if (dir==='nw'||dir==='ne') wdata.y = Math.max(0, rsRowY+(rsH-sqClamped));
        wdata.w = sqClamped; wdata.h = sqClamped;
      }

      const px = wPxResponsive(wdata, null);
      el.style.left=px.left+'px'; el.style.top=px.top+'px';
      el.style.width=px.width+'px'; el.style.height=px.height+'px';
    }

    function onResizeUp() {
      if (!resizing) return; resizing=false;
      el.style.transition='';
      pushDown(wdata, state.widgets);
      clamp(wdata); debouncedSaveState();
      renderAll();
    }

    handle._unbind = () => { if (_docMoveH === onResizeMove) { _docMoveH = null; _docUpH = null; } };
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
  saveState();
  renderAll();
  updateEmptyHint();
}

function removeWidget(id) {
  const el = document.querySelector(`.widget[data-id="${id}"]`);
  if (el) { cleanupWidget(id); el._unbindDrag?.(); el.style.opacity='0'; el.style.transform='scale(.88)'; el.style.transition='all .2s'; setTimeout(()=>el.remove(),200); }
  localStorage.removeItem('dash_limg_' + id);
  state.widgets = state.widgets.filter(w=>w.id!==id);
  // Keep selection state in sync
  if (typeof selectedIds !== 'undefined') { selectedIds.delete(id); updateSelectionUI(); }
  saveState();
  updateEmptyHint();
}

function renderAll() {
  const canvas = document.getElementById('grid-canvas');
  canvas.querySelectorAll('.widget').forEach(el=>{ cleanupWidget(el.dataset.id); el._unbindDrag?.(); el.remove(); });

  const layoutOverrides = _flowOverrides;

  // Compute canvas height from the effective (possibly overridden) layout
  let maxRow = 0;
  state.widgets.forEach(w => {
    const ov = layoutOverrides && layoutOverrides[w.id];
    const effY = ov ? ov.y : w.y;
    maxRow = Math.max(maxRow, effY + w.h);
  });
  canvas.style.minHeight = Math.max(ry(maxRow+2), document.getElementById('grid-outer').clientHeight-40) + 'px';

  state.widgets.forEach(w => {
    const el = makeWidget(w, layoutOverrides);
    if (el) canvas.appendChild(el);
  });
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
  const layoutOverrides = _flowOverrides;

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
    });
  });
}

// Reflow on resize
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    _flowOverrides = computeFlowLayout();
    buildGridBg();
    renderAll();
  }, 120);
});
window.addEventListener('beforeunload', () => clearTimeout(resizeTimer), { once: true });
