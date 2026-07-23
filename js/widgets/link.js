/* ── LINK ── */
// Hosts whose favicon has already loaded successfully once during this page
// session, shared across every link widget instance. Google's favicon
// service sends no Access-Control-Allow-Origin header, so the actual image
// bytes can't be read into a canvas/data-URL and persisted across page
// loads (a CORS-tainted canvas throws on toDataURL) — this in-memory set is
// the caching lever actually available client-side: once a host is known
// good this session, later re-renders (tidy/resize/re-add) show its icon
// immediately instead of the placeholder-then-swap sequence below.
const _faviconReadyHosts = new Set();

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
        iconHtml = `<img src="${customImg}" alt="" class="lw-custom-img">`;
      } else if (emoji) {
        iconHtml = `<span>${emoji}</span>`;
      } else if (favKnownGood) {
        iconHtml = `<img src="${fav}" alt="" class="lw-img" data-fb="${esc(fallbackEmoji)}">`;
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
      // already rendered the <img> directly above.
      if (fav && !favKnownGood) {
        const preload = new Image();
        preload.onload = () => {
          _faviconReadyHosts.add(host);
          const favEl = document.getElementById(`lf-${id}`);
          const placeholder = favEl?.querySelector('.lw-fb-emoji');
          if (!placeholder) return; // widget re-rendered/removed before this resolved
          const realImg = document.createElement('img');
          realImg.className = 'lw-img'; realImg.alt = '';
          realImg.dataset.fb = fallbackEmoji;
          realImg.src = fav;
          realImg.addEventListener('error', () => { _faviconReadyHosts.delete(host); });
          placeholder.replaceWith(realImg);
        };
        preload.src = fav;
      }

      const anchor = document.getElementById(`la-${id}`);
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


