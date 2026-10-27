/* First-paint theme hint. MV3 extension pages reject inline scripts (and
   manifest CSP hashes are rejected as insecure), so this stays a tiny
   blocking local script loaded before style.css. It reads only the small
   `dash_theme` key, never the state/background payload, and falls back to
   `dash_v3` once for existing installs. */
(function () {
  try {
    var hint = null;
    try {
      var raw = localStorage.getItem('dash_theme');
      if (raw) hint = JSON.parse(raw);
    } catch (_) {}

    if (!hint) {
      try {
        var s = JSON.parse(localStorage.getItem('dash_v3') || 'null');
        if (s && s.settings) {
          hint = {
            theme: s.settings.theme || 'monet',
            hue: s.settings.monetHue || 'lavender'
          };
          try { localStorage.setItem('dash_theme', JSON.stringify(hint)); } catch (_) {}
        }
      } catch (_) {}
    }

    var theme = (hint && hint.theme) || 'monet';
    var hue = (hint && hint.hue) || 'lavender';
    var root = document.documentElement;
    root.setAttribute('data-theme', theme);
    if (theme === 'monet') root.setAttribute('data-monet-hue', hue);
    else root.removeAttribute('data-monet-hue');
    root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
    // Do not add has-custom-bg here: it makes html/body transparent, and the
    // background image is applied a frame later by main.js. Until then the
    // theme's own background must stay visible (no white/transparent flash).
  } catch (_) {}
})();
