'use strict';
const STORAGE_VERSION = 3; // bump this when data shape changes
const DEF_WIDGETS = [
  { id:'wl1', type:'link', x:0, y:0, w:1, h:1, config:{ name:'zen-tab', url:'https://github.com/Coveduoji/zen-tab' } },
];
const DEF_SETTINGS = {
  theme: 'monet', monetHue: 'lavender', engine: 'google', lang: 'zh',
  compactMode: true, background: { type:'default', value:'', overlay:0, blur:0, brightness:1 }
};

function loadState() {
  try {
    const raw = localStorage.getItem('dash_v3');
    if (!raw) return { version: STORAGE_VERSION, widgets: DEF_WIDGETS.map(w => ({...w, config:{...w.config}})), settings:{...DEF_SETTINGS} };
    const s = JSON.parse(raw);

    // Version mismatch: attempt safe migration instead of silent data loss
    if (s.version !== STORAGE_VERSION) {
      // Future: add per-version migration logic here
      // For now: preserve widgets + settings, just update version
      s.version = STORAGE_VERSION;
      if (!s.settings) s.settings = {...DEF_SETTINGS};
      if (!s.widgets)  s.widgets  = DEF_WIDGETS.map(w => ({...w, config:{...w.config}}));
    }

    // Restore bg image from separate key if needed
    if (s?.settings?.background?.value === '__dash_bg_img__') {
      const img = localStorage.getItem('dash_bg_img');
      if (img) s.settings.background.value = img;
      else { s.settings.background.type = 'default'; s.settings.background.value = ''; }
    }
    // Restore link widget custom images from separate keys
    s?.widgets?.forEach(w => {
      if (w.type === 'link' && w.config?.customImg === '__dash_limg__') {
        const img = localStorage.getItem('dash_limg_' + w.id);
        if (img) w.config.customImg = img;
        else delete w.config.customImg;
      }
    });
    return s;
  } catch(e) {
    return { version: STORAGE_VERSION, widgets: DEF_WIDGETS.map(w => ({...w, config:{...w.config}})), settings:{...DEF_SETTINGS} };
  }
}

function saveState() {
  const bgValue = state.settings.background?.value || '';
  const isBgImg = state.settings.background?.type === 'image' && bgValue.startsWith('data:');
  try {
    const slim = JSON.parse(JSON.stringify({ version: STORAGE_VERSION, widgets: state.widgets, settings: state.settings }));
    if (isBgImg) {
      localStorage.setItem('dash_bg_img', bgValue);
      slim.settings.background.value = '__dash_bg_img__';
    } else {
      localStorage.removeItem('dash_bg_img');
    }
    slim.widgets.forEach(w => {
      if (w.type === 'link' && w.config?.customImg?.startsWith('data:')) {
        localStorage.setItem('dash_limg_' + w.id, w.config.customImg);
        w.config.customImg = '__dash_limg__';
      } else if (w.type === 'link' && !w.config?.customImg) {
        localStorage.removeItem('dash_limg_' + w.id);
      }
    });
    localStorage.setItem('dash_v3', JSON.stringify(slim));
  } catch(e) {
    if (e.name === 'QuotaExceededError') {
      try {
        const minimal = JSON.parse(JSON.stringify({ version: STORAGE_VERSION, widgets: state.widgets, settings: state.settings }));
        if (isBgImg) minimal.settings.background.value = '__dash_bg_img__';
        minimal.widgets.forEach(w => { if (w.type === 'link') delete w.config?.customImg; });
        localStorage.setItem('dash_v3', JSON.stringify(minimal));
      } catch(_) {}
      toast(lang === 'zh' ? '⚠ 存储空间不足，自定义图标可能未保存' : '⚠ Storage full — custom icons may not be saved', 'err');
    }
  }
}

const state = loadState();
if (!state.settings) state.settings = {...DEF_SETTINGS};
if (!state.widgets)  state.widgets  = DEF_WIDGETS.map(w => ({...w}));
// Sync lang global (defined in i18n.js) from saved settings
lang = state.settings.lang || 'zh';

// Sanitize geometry on load
state.widgets.forEach(w => {
  clamp(w);
  if (w.type === 'pomodoro' || w.type === 'link') {
    const sq = Math.max(w.w, w.h); w.w = sq; w.h = sq; clamp(w);
  }
});

const debouncedSaveState = debounce(saveState, 500);

// Flush state immediately on tab close — bypasses the 500 ms debounce window
window.addEventListener('beforeunload', saveState);
