/* ── LINK ── */
// Hosts whose favicon has already loaded successfully once during this page
// session, shared across every link widget instance. Google's favicon
// service sends no Access-Control-Allow-Origin header, so the actual image
// bytes can't be read into a canvas/data-URL and persisted across page
// loads (a CORS-tainted canvas throws on toDataURL) — this in-memory set is
// the caching lever actually available client-side: once a host is known
// good this session, later re-renders (reorder/re-add) show its icon
// immediately instead of the placeholder-then-swap sequence below.
const _faviconReadyHosts = new Set();
// One in-flight favicon request per host; every link widget pointing at the
// same site waits on it instead of issuing its own request.
const _faviconWaiters = new Map();
function _loadFavicon(host, fav, cb) {
  if (_faviconReadyHosts.has(host)) { cb(true); return; }
  const waiters = _faviconWaiters.get(host);
  if (waiters) { waiters.push(cb); return; }
  _faviconWaiters.set(host, [cb]);
  const preload = new Image();
  const done = ok => {
    if (ok) _faviconReadyHosts.add(host);
    const list = _faviconWaiters.get(host) || [];
    _faviconWaiters.delete(host);
    list.forEach(fn => { try { fn(ok); } catch (_) {} });
  };
  preload.onload = () => done(true);
  preload.onerror = () => done(false);
  preload.src = fav;
}

reg({ type:'link', get name(){return t('w_link');}, get desc(){return t('w_link_d');}, icon:'🔗', cat:'basic',
  render(body, cfg, id, wdata) {
    cfg.name = cfg.name||'Link'; cfg.url = cfg.url||'https://example.com';
    body.style.cssText = 'padding:0;height:100%';
    function draw() {
      let host=''; try { host=new URL(cfg.url).hostname; } catch(e){}
      const fav = host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : '';
      const emoji = cfg.emoji || null;
      const customImg = cfg.customImg || null;
      const fallbackEmoji = linkEmoji(host);
      const favKnownGood = fav && _faviconReadyHosts.has(host);

      let iconHtml;
      if (customImg) {
        iconHtml = `<img src="${customImg}" alt="" decoding="async" class="lw-custom-img">`;
      } else if (emoji) {
        iconHtml = `<span>${emoji}</span>`;
      } else if (favKnownGood) {
        iconHtml = `<img src="${fav}" alt="" decoding="async" class="lw-img" data-fb="${esc(fallbackEmoji)}">`;
      } else {
        // Show the fallback emoji immediately instead of a blank box while
        // the favicon request is in flight — swapped for the real icon
        // on load below, so a slow/cold fetch never reads as "nothing
        // loaded" on this render.
        iconHtml = `<span class="lw-fb-emoji">${esc(fallbackEmoji)}</span>`;
      }
      body.innerHTML = `<div class="link-widget-body" id="la-${id}" role="link" tabindex="0" title="${esc(cfg.name)}">
        <div class="lw-fav" id="lf-${id}">${iconHtml}</div>
        <div class="lw-name">${esc(cfg.name)}</div>
        <div class="lw-tooltip">${esc(cfg.name)}</div>
      </div>`;

      // Favicon error fallback (only reachable via the favKnownGood <img> path)
      const img = body.querySelector('.lw-img');
      if (img) {
        img.addEventListener('error', () => {
          _faviconReadyHosts.delete(host);
          const fb = document.createElement('span');
          fb.textContent = img.dataset.fb || '🔗';
          img.replaceWith(fb);
        });
      }

      // Background load: swap the placeholder emoji for the real favicon
      // once it resolves. Skipped entirely once favKnownGood — that path
      // already rendered the <img> directly above. Requests are shared per
      // host, so ten links to one site cost one favicon fetch.
      if (fav && !favKnownGood) {
        _loadFavicon(host, fav, ok => {
          if (!ok) return;
          // body is this widget's detached/live subtree; document.getElementById
          // would miss it while makeWidget() is still building a fragment.
          const favEl = body.querySelector('.lw-fav');
          const placeholder = favEl?.querySelector('.lw-fb-emoji');
          if (!placeholder) return; // widget re-rendered/removed before this resolved
          const realImg = document.createElement('img');
          realImg.className = 'lw-img'; realImg.alt = ''; realImg.decoding = 'async';
          realImg.dataset.fb = fallbackEmoji;
          realImg.src = fav;
          realImg.addEventListener('error', () => { _faviconReadyHosts.delete(host); });
          placeholder.replaceWith(realImg);
        });
      }

      const anchor = body.querySelector('.link-widget-body');
      if (!anchor) return;
      anchor.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && !editMode) {
          e.preventDefault();
          const w = body.closest('.widget');
          if (!w || !w._wasDragged) window.open(cfg.url, '_blank', 'noopener,noreferrer');
        }
      });
    }
    // Editing is right-click-menu-only (see js/ui/panels.js ctx-edit) — no
    // inline edit button on the widget itself.
    draw();
  }
});


