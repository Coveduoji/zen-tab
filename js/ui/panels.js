'use strict';
// ── Panel manager ─────────────────────────────────────────
let _activePanel = null;
const PANEL_BG = { 'marketplace':'marketplace-bg', 'settings-panel':'settings-bg' };

function openPanel(panelId, onOpenCb) {
  if (_activePanel && _activePanel !== panelId) _closePanel(_activePanel, false);
  _activePanel = panelId;
  const bg = document.getElementById(PANEL_BG[panelId]);
  if (bg) bg.classList.add('open');
  if (onOpenCb) onOpenCb();
}
function _closePanel(panelId, clearActive=true) {
  const bg = document.getElementById(PANEL_BG[panelId]);
  if (bg) bg.classList.remove('open');
  if (clearActive) _activePanel = null;
}
function closeAllPanels() {
  Object.keys(PANEL_BG).forEach(id => _closePanel(id, false));
  _activePanel = null;
}

function openSettings()  { openPanel('settings-panel', renderSettings); }
function closeSettings() { _closePanel('settings-panel'); }
function openMkt()       { openPanel('marketplace', renderMarket); }
function closeMkt()      { _closePanel('marketplace'); }

// ── Context menu ──────────────────────────────────────────
let _ctxWidgetId = null;

function openCtxMenu(e, widgetId) {
  e.preventDefault(); e.stopPropagation();
  _ctxWidgetId = widgetId;
  const wdata = state.widgets.find(w => w.id === widgetId);
  const menu  = document.getElementById('ctx-menu');
  const isLink  = wdata && wdata.type === 'link';
  document.getElementById('ctx-link').style.display = isLink ? 'flex' : 'none';
  const editLabelMap = { link: t('ctx_edit_link'), notes: t('ctx_edit_note') };
  const wtype = wdata ? wdata.type : '';
  document.getElementById('ctx-edit-label').textContent = editLabelMap[wtype] || t('ctx_edit_generic');
  document.getElementById('ctx-edit').style.display = ['link','notes'].includes(wtype) ? 'flex' : 'none';
  let x = e.clientX, y = e.clientY;
  menu.style.opacity='0'; menu.style.display='block'; menu.classList.remove('open');
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  if (x+mw > window.innerWidth-12)  x = window.innerWidth-mw-12;
  if (y+mh > window.innerHeight-12) y = window.innerHeight-mh-12;
  menu.style.left=x+'px'; menu.style.top=y+'px'; menu.style.display='';
  requestAnimationFrame(() => menu.classList.add('open'));
}
function closeCtxMenu() {
  document.getElementById('ctx-menu').classList.remove('open');
  _ctxWidgetId = null;
}

// ── Top clock ─────────────────────────────────────────────
const WD_ZH = ['周日','周一','周二','周三','周四','周五','周六'];
const WD_EN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MO_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function initTopClock() {
  const hmEl   = document.getElementById('top-clock-hm');
  const dateEl = document.getElementById('top-clock-date');
  if (!hmEl) return;
  function tickTop() {
    const n = new Date();
    const h = String(n.getHours()).padStart(2,'0'), m = String(n.getMinutes()).padStart(2,'0'), s = String(n.getSeconds()).padStart(2,'0');
    hmEl.textContent = pureMode ? `${h}:${m}:${s}` : `${h}:${m}`;
    if (dateEl) dateEl.textContent = lang==='zh' ? `${WD_ZH[n.getDay()]} · ${n.getMonth()+1}月${n.getDate()}日` : `${WD_EN[n.getDay()]}, ${MO_EN[n.getMonth()]} ${n.getDate()}`;
  }
  tickTop();
  let _clockId = setInterval(tickTop, 1000);
  // Pause interval when tab is hidden; resume (with immediate tick) when visible again
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearInterval(_clockId); _clockId = null; }
    else { tickTop(); _clockId = setInterval(tickTop, 1000); }
  });
  window.addEventListener('beforeunload', () => clearInterval(_clockId), { once: true });
}

function setLang(l) {
  lang = l; state.settings.lang = l; saveState();
  applyI18n();
  if (document.getElementById('settings-bg')?.classList.contains('open')) renderSettings();
  if (document.getElementById('marketplace-bg')?.classList.contains('open')) renderMarket();
}

function initPanels() {
  // Backdrop close
  ['marketplace-bg','settings-bg'].forEach(bgId => {
    document.getElementById(bgId)?.addEventListener('click', e => { if (e.target===e.currentTarget) closeAllPanels(); });
  });

  // FAB buttons
  document.getElementById('fab-settings').addEventListener('click', openSettings);
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  document.getElementById('fab-add').addEventListener('click', openMkt);
  document.getElementById('mkt-close').addEventListener('click', closeMkt);
  document.getElementById('fab-theme').addEventListener('click', function() {
    const cyc = { light:'dark', dark:'light' };
    applyTheme(cyc[state.settings.theme]||'dark', this);
    toast(t('theme_switched'), 'ok');
  });

  // FAB hover zone
  // FAB visibility is handled entirely by CSS :hover on #fab-hover-zone and #fab-group

  // Context menu actions
  document.addEventListener('mousedown', e => { if (!document.getElementById('ctx-menu').contains(e.target)) closeCtxMenu(); });

  document.getElementById('ctx-edit').addEventListener('click', () => {
    const wdata = state.widgets.find(w => w.id === _ctxWidgetId); closeCtxMenu(); if (!wdata) return;
    if (wdata.type === 'link') {
      showLinkModal({ name:wdata.config.name, url:wdata.config.url, emoji:wdata.config.emoji, customImg:wdata.config.customImg }, saved => {
        const url = normalizeUrl(saved.url); wdata.config.name=saved.name; wdata.config.url=url;
        if (saved.emoji) wdata.config.emoji=saved.emoji; else delete wdata.config.emoji;
        if (saved.customImg) wdata.config.customImg=saved.customImg; else delete wdata.config.customImg;
        saveState(); renderAll(); toast(t('link_saved'), 'ok');
      }, true, wdata.id); return;
    }
    if (wdata.type === 'notes') {
      const el = document.querySelector(`.widget[data-id="${wdata.id}"]`);
      if (el) { const ta = el.querySelector('textarea'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }
    }
  });
  document.getElementById('ctx-link').addEventListener('click', () => {
    const wdata = state.widgets.find(w => w.id === _ctxWidgetId); closeCtxMenu();
    if (wdata?.config.url) navigator.clipboard.writeText(wdata.config.url).then(() => toast(t('link_copied'), 'ok'));
  });
  document.getElementById('ctx-front').addEventListener('click', () => {
    const idx = state.widgets.findIndex(w => w.id === _ctxWidgetId); closeCtxMenu(); if (idx < 0) return;
    const [wdata] = state.widgets.splice(idx, 1); wdata.y=0; wdata.x=0;
    const slot = findFreeSlot(wdata.w, wdata.h, state.widgets); wdata.x=slot.x; wdata.y=slot.y;
    state.widgets.unshift(wdata);
    saveState(); renderAll();
  });
  document.getElementById('ctx-del').addEventListener('click', () => {
    const id = _ctxWidgetId; closeCtxMenu();
    removeWidget(id);
    toast(t('widget_removed'), '');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    const tag = document.activeElement.tagName;
    if (tag==='INPUT'||tag==='TEXTAREA') { if (e.key==='Escape') document.activeElement.blur(); return; }
    if (e.ctrlKey||e.metaKey) {
      if (e.key==='k') { e.preventDefault(); openCmd(); }
      else if (e.key==='a') { e.preventDefault(); openMkt(); }
      else if (e.key==='t') { e.preventDefault(); const btn=document.getElementById('fab-theme'); applyTheme(state.settings.theme==='dark'?'light':'dark',btn); toast(t('theme_switched'),'ok'); }
      else if (e.key==='e') { e.preventDefault(); editMode?exitEditMode():enterEditMode(); }
      else if (e.key==='p') { e.preventDefault(); pureMode?exitPureMode():enterPureMode(); }
    }
    if (e.key==='Escape') {
      if (pureMode) { exitPureMode(); return; }
      const anyModal = document.querySelector('.modal-bg.open');
      if (anyModal) { anyModal.classList.remove('open'); return; }
      if (document.getElementById('cmd-overlay').classList.contains('open')) { closeCmd(); return; }
      if (document.getElementById('ctx-menu').classList.contains('open')) { closeCtxMenu(); return; }
      if (_activePanel) { closeAllPanels(); return; }
      if (editMode) { exitEditMode(); return; }
    }
    if (e.key==='/') { e.preventDefault(); document.getElementById('search-input').focus(); }
  });

  // bg file input global handler
  document.getElementById('bg-file-input')?.addEventListener('change', e => {
    const file = e.target.files?.[0]; if (file) _loadBgFile(file); e.target.value = '';
  });
}
