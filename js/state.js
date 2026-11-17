'use strict';
const STORAGE_VERSION = 3; // bump this when data shape changes
const DEF_WIDGETS = [
  { id:'wl1', type:'link', w:1, h:1, config:{ name:'zen-tab', url:'https://github.com/Coveduoji/zen-tab' } },
];
const DEF_SETTINGS = {
  theme: 'monet', monetHue: 'lavender', engine: 'google', lang: 'zh',
  showLabels: false,
  background: { type:'default', value:'', overlay:0, blur:0, brightness:1 }
};

// ── Persisted binary asset bookkeeping ────────────────────
// Large background data lives in IndexedDB; dash_limg_<id> still holds
// small custom icons in localStorage. Remember written icon values so only
// real changes are written.
const _savedImgs = new Map();        // widget id -> last custom icon data URL
let _lastStateJson = null;           // skip identical dash_v3 writes
let _lastThemeHint = null;           // tiny first-paint hint (dash_theme)
let _orderMigrated = false;          // one-time sort of old free-position data

function _defaultState() {
  return {
    version: STORAGE_VERSION,
    orderOnly: true,
    widgets: DEF_WIDGETS.map(w => ({ ...w, config: { ...w.config } })),
    settings: { ...DEF_SETTINGS, background: { ...DEF_SETTINGS.background } },
    gridLayouts: {},
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem('dash_v3');
    if (!raw) return _defaultState();
    const s = JSON.parse(raw);

    // Version mismatch: attempt safe migration instead of silent data loss
    if (s.version !== STORAGE_VERSION) {
      // Future: add per-version migration logic here
      // For now: preserve widgets + settings, just update version
      s.version = STORAGE_VERSION;
      if (!s.settings) s.settings = { ...DEF_SETTINGS, background: { ...DEF_SETTINGS.background } };
      if (!s.widgets)  s.widgets  = DEF_WIDGETS.map(w => ({ ...w, config: { ...w.config } }));
    }

    // Restore bg image from separate key if needed
    if (s?.settings?.background?.value === '__dash_bg_img__') {
      // Legacy stores may still have the image in localStorage; use it now and
      // let loadStoredBackground() migrate it into IndexedDB. If it is not
      // there, keep the placeholder and load the IndexedDB blob asynchronously.
      const img = localStorage.getItem('dash_bg_img');
      if (img) s.settings.background.value = img;
    }
    // Restore link widget custom images from separate keys
    s?.widgets?.forEach(w => {
      if (w.type === 'link' && w.config?.customImg === '__dash_limg__') {
        const img = localStorage.getItem('dash_limg_' + w.id);
        if (img) { w.config.customImg = img; _savedImgs.set(w.id, img); }
        else delete w.config.customImg;
      }
    });

    // Layout is order-only now. For existing data, keep the user's current
    // visual reading order as the initial order (then never derive order from
    // x/y again). New installs already have orderOnly:true.
    if (!s.orderOnly) {
      s.widgets.sort((a, b) => (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0));
      s.orderOnly = true;
      _orderMigrated = true;
    }
    if (!s.gridLayouts || typeof s.gridLayouts !== 'object') s.gridLayouts = {};
    return s;
  } catch(e) {
    return _defaultState();
  }
}

function _themeHintJson() {
  return JSON.stringify({
    theme: state.settings.theme || 'monet',
    hue: state.settings.monetHue || 'lavender',
  });
}

function _saveThemeHint() {
  try {
    const json = _themeHintJson();
    if (json !== _lastThemeHint) {
      localStorage.setItem('dash_theme', json);
      _lastThemeHint = json;
    }
  } catch (_) {}
}

// Build the on-disk view (binary fields replaced by placeholders) without
// structuredClone(): cloning the full state copied every multi-MB string.
function _slimState() {
  const src = state.settings.background || { ...DEF_SETTINGS.background };
  const settings = { ...state.settings, background: { ...src } };
  const widgets = state.widgets.map(w => {
    // x/y are legacy free-position fields; order is the array now.
    const { x, y, ...rest } = w;
    if (rest.type !== 'link' || !rest.config) return rest;
    const custom = rest.config.customImg;
    return (custom && custom.startsWith('data:'))
      ? { ...rest, config: { ...rest.config, customImg: '__dash_limg__' } }
      : rest;
  });
  return { settings, widgets };
}

function saveState() {
  const bg = state.settings.background || { ...DEF_SETTINGS.background };
  const bgValue = bg.value || '';
  const isBgImg = bg.type === 'image' && bgValue.startsWith('data:');
  const isBgPlaceholder = bg.type === 'image' && bgValue === '__dash_bg_img__';
  try {
    const slim = _slimState();

    // Background binaries live in IndexedDB (loadStoredBackground/_loadBgFile
    // manage them); dash_v3 only keeps the placeholder. This avoids the
    // localStorage quota that made large backgrounds revert on refresh.
    if (isBgImg || isBgPlaceholder) {
      slim.settings.background.value = '__dash_bg_img__';
    }

    // Custom icons: write only changed ids, and clean up removed widgets.
    const live = new Set();
    for (const w of state.widgets) {
      if (w.type !== 'link' || !w.config) continue;
      const custom = w.config.customImg;
      if (custom && custom.startsWith('data:')) {
        live.add(w.id);
        if (_savedImgs.get(w.id) !== custom) {
          localStorage.setItem('dash_limg_' + w.id, custom);
          _savedImgs.set(w.id, custom);
        }
      } else if (_savedImgs.has(w.id)) {
        localStorage.removeItem('dash_limg_' + w.id);
        _savedImgs.delete(w.id);
      }
    }
    for (const id of [..._savedImgs.keys()]) {
      if (!live.has(id)) {
        localStorage.removeItem('dash_limg_' + id);
        _savedImgs.delete(id);
      }
    }

    const json = JSON.stringify({ version: STORAGE_VERSION, orderOnly: true, widgets: slim.widgets, settings: slim.settings, gridLayouts: state.gridLayouts || {} });
    if (json !== _lastStateJson) {
      localStorage.setItem('dash_v3', json);
      _lastStateJson = json;
    }
    _saveThemeHint();
  } catch(e) {
    if (e && e.name === 'QuotaExceededError') {
      try {
        // Degrade by dropping custom icons rather than losing everything.
        const slim = _slimState();
        const widgets = slim.widgets.map(w => {
          if (w.type !== 'link' || !w.config) return w;
          const config = { ...w.config };
          delete config.customImg;
          return { ...w, config };
        });
        const settings = { ...slim.settings, background: { ...slim.settings.background } };
        if (isBgImg) settings.background.value = '__dash_bg_img__';
        const json = JSON.stringify({ version: STORAGE_VERSION, orderOnly: true, widgets, settings, gridLayouts: state.gridLayouts || {} });
        localStorage.setItem('dash_v3', json);
        _lastStateJson = json;
      } catch(_) {}
      toast(lang === 'zh' ? '⚠ 存储空间不足，自定义图标可能未保存' : '⚠ Storage full — custom icons may not be saved', 'err');
    }
  }
}

const state = loadState();
if (!state.settings) state.settings = { ...DEF_SETTINGS, background: { ...DEF_SETTINGS.background } };
if (!state.settings.background) state.settings.background = { ...DEF_SETTINGS.background };
if (!state.widgets)  state.widgets  = DEF_WIDGETS.map(w => ({ ...w, config: { ...w.config } }));
if (!state.gridLayouts || typeof state.gridLayouts !== 'object') state.gridLayouts = {};
// Sync lang global (defined in i18n.js) from saved settings
lang = state.settings.lang || 'zh';

// Folders reference top-level link widgets by id. Normalize the references at
// boot: drop unknown/non-link ids, prevent duplicates, and keep each link in at
// most one folder. Filed links stay in state.widgets so saveState()'s custom
// icon bookkeeping keeps working for them.
{
  const filed = new Set();
  for (const w of state.widgets) {
    if (w.type !== 'folder') continue;
    if (!w.config || typeof w.config !== 'object') w.config = {};
    if (typeof w.config.name !== 'string' || !w.config.name.trim()) w.config.name = t('folder_default');
    const ids = Array.isArray(w.config.childIds) ? w.config.childIds : [];
    w.config.childIds = [];
    for (const id of ids) {
      if (filed.has(id)) continue;
      const child = state.widgets.find(x => x.id === id && x.type === 'link');
      if (!child) continue;
      filed.add(id);
      w.config.childIds.push(id);
    }
  }
}

// Sanitize geometry on load — re-derive h from w for any aspect-locked
// widget type (link/pomodoro square, weather/clock 3:2, ...) so widgets
// saved under older size rules snap back to a valid ratio instead of just
// being independently min/max clamped into a distorted shape.
const _bootVc = visibleCols();
state.widgets.forEach(w => {
  // Overlay dividers are not grid widgets and carry no w/h.
  if (w.type === 'divider_h' || w.type === 'divider_v') return;
  clampSize(w, _bootVc);
  if (!ASPECT_LOCK[w.type]) return;
  const ratio = ASPECT_LOCK[w.type];
  // For square types keep the old "take the larger side" behavior; for wide
  // types (3:2 etc.) width is the natural driving dimension.
  w.w = ratio === 1 ? Math.max(w.w, w.h) : w.w;
  w.h = Math.round(w.w / ratio);
  clampSize(w, _bootVc);
});

const debouncedSaveState = debounce(saveState, 500);
const flushSave = () => saveState();

// Flush immediately on tab close/hide — bypasses the 500ms debounce window.
window.addEventListener('beforeunload', flushSave);
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });
