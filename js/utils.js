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
  try { return prefix + '_' + crypto.randomUUID().slice(0, 8); }
  catch (_) { return prefix + '_' + Math.random().toString(36).slice(2, 9); }
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

// ── Image downscale (canvas) ──────────────────────────────
// For small UI-rendered images like custom link icons, which only ever
// display at a few hundred px — storing an unbounded original wastes a lot
// of the shared localStorage quota for detail nobody sees. Not used for the
// background image, which is shown full-screen and kept at full quality.
// Encodes to lossy WebP by default: at icon sizes q=0.9 is visually
// indistinguishable from PNG, transparency is preserved, and photos shrink
// roughly 10x (10 photo icons ≈ 230 KB instead of ≈ 2.3 MB). Browsers that
// do not support WebP return a PNG data URL from toDataURL(), so the stored
// value is always valid. Capped at maxDim on the longer side; never upscales.
function resizeImageFile(file, maxDim, mime = 'image/webp', quality = 0.9) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL(mime, quality));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
