'use strict';
// ── HTML escape ──────────────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── URL normalisation & security ─────────────────────────
function normalizeUrl(raw) {
  const s = (raw || '').trim();
  if (!s) return '';
  // Block dangerous protocols
  if (/^(javascript|data|vbscript):/i.test(s)) return 'https://';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return 'https:' + s;
  return 'https://' + s;
}

// ── Unique ID generator ───────────────────────────────────
function genId(prefix = 'w') {
  return prefix + '_' + Math.random().toString(36).slice(2, 9);
}

// ── Debounce ──────────────────────────────────────────────
function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// ── LocalStorage cache factory ────────────────────────────
function makeLocalCache(key, ttlMs) {
  return {
    save(payload) {
      try { localStorage.setItem(key, JSON.stringify({ payload, ts: Date.now() })); } catch(_) {}
    },
    load() {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const { payload, ts } = JSON.parse(raw);
        return (Date.now() - ts < ttlMs) ? payload : null;
      } catch(_) { return null; }
    },
    loadStale() {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw).payload : null;
      } catch(_) { return null; }
    },
    age() {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw).ts : null;
      } catch(_) { return null; }
    },
  };
}

// ── Favicon-fallback emoji for link widgets ───────────────
function linkEmoji(host) {
  if (!host) return '🔗';
  const map = {
    'github.com':'🐙','youtube.com':'▶️','mail.google.com':'📧',
    'google.com':'🔍','twitter.com':'🐦','x.com':'🐦',
    'reddit.com':'🟠','notion.so':'📝','figma.com':'🎨',
    'linkedin.com':'💼','instagram.com':'📸','facebook.com':'👤',
    'amazon.com':'📦','netflix.com':'🎬','spotify.com':'🎵',
    'twitch.tv':'🎮','discord.com':'💬','slack.com':'💬',
    'stackoverflow.com':'📚','medium.com':'✍️','dev.to':'👩‍💻',
    'openai.com':'🤖','anthropic.com':'🤖',
  };
  for (const [k,v] of Object.entries(map)) {
    if (host === k || host.endsWith('.' + k)) return v;
  }
  return '🔗';
}
