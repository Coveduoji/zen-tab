/* ── EMBED ── */
reg({ type:'embed', get name(){return t('w_embed');}, get desc(){return t('w_embed_d');}, icon:'🌐', cat:'pro',
  render(body, cfg, id) {
    cfg.url = cfg.url || '';

    /* ── URL sanitiser ── */
    function sanitiseUrl(raw) {
      const s = (raw || '').trim();
      if (!s) return '';
      return /^https?:\/\//i.test(s) ? s : 'https://' + s;
    }

    /* ── Build embed UI with createElement (no innerHTML for URLs) ── */
    function buildEmbed(rawUrl) {
      const url = sanitiseUrl(rawUrl);

      /* clear previous content cleanly */
      body.innerHTML = '';

      /* ── wrapper fills the entire w-body ── */
      const wrap = document.createElement('div');
      wrap.className = 'embed-wrap';
      wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;';

      /* ── toolbar ── */
      const toolbar = document.createElement('div');
      toolbar.className = 'embed-toolbar';

      const urlLabel = document.createElement('span');
      urlLabel.className = 'embed-url-display';
      urlLabel.title = url;
      urlLabel.textContent = url;

      const mkBtn = (html, tip) => {
        const b = document.createElement('button');
        b.className = 'embed-tb-btn';
        b.innerHTML = html;
        b.title = t(tip);
        return b;
      };
      const btnOpen  = mkBtn('&#x2197;', 'embed_open');
      const btnRef   = mkBtn('&#x27F3;', 'embed_refresh');
      const btnEdit  = mkBtn('&#x270E;', 'embed_edit');

      toolbar.append(urlLabel, btnOpen, btnRef, btnEdit);

      /* ── frame area ── */
      const frameWrap = document.createElement('div');
      frameWrap.className = 'embed-frame-wrap';
      frameWrap.style.cssText = 'flex:1;position:relative;overflow:hidden;';

      /* iframe — src set via property, not innerHTML, to avoid encoding issues */
      const iframe = document.createElement('iframe');
      iframe.className = 'embed-iframe';
      iframe.loading = 'lazy';
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
      iframe.setAttribute('referrerpolicy', 'no-referrer');
      iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
      if (url) iframe.src = url;

      /* blocked overlay */
      const blocked = document.createElement('div');
      blocked.className = 'embed-blocked';
      blocked.style.cssText =
        'position:absolute;inset:0;display:none;flex-direction:column;' +
        'align-items:center;justify-content:center;gap:8px;padding:16px;' +
        'text-align:center;background:var(--card);';

      const blockedIco = document.createElement('div');
      blockedIco.className = 'embed-blocked-ico';
      blockedIco.textContent = '🚫';

      const blockedMsg = document.createElement('div');
      blockedMsg.className = 'embed-blocked-msg';
      blockedMsg.textContent = t('embed_blocked');

      const blockedLink = document.createElement('a');
      blockedLink.className = 'embed-blocked-link';
      blockedLink.target = '_blank';
      blockedLink.rel = 'noopener noreferrer';
      blockedLink.href = url;
      blockedLink.textContent = t('embed_open') + ' ↗';

      blocked.append(blockedIco, blockedMsg, blockedLink);
      frameWrap.append(iframe, blocked);
      wrap.append(toolbar, frameWrap);
      body.appendChild(wrap);

      /* ── iframe load error detection ── */
      let loadTimer = null;
      const showBlocked = () => {
        blocked.style.display = 'flex';
      };

      if (url) {
        /* Heuristic: if iframe is still blank after 8 s it's likely blocked */
        loadTimer = setTimeout(() => {
          try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            if (!doc || !doc.body || doc.body.innerHTML.trim() === '') showBlocked();
          } catch(_) { /* cross-origin = loaded fine */ }
        }, 8000);

        iframe.addEventListener('load', () => {
          clearTimeout(loadTimer);
          /* Check for empty document (X-Frame-Options / CSP block) */
          try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            if (doc && doc.body && doc.body.innerHTML.trim() === '') showBlocked();
          } catch(_) {}
        });
        iframe.addEventListener('error', () => {
          clearTimeout(loadTimer);
          showBlocked();
        });
      }

      /* ── toolbar events ── */
      btnOpen.addEventListener('click', e => {
        e.stopPropagation();
        window.open(url, '_blank', 'noopener');
      });
      btnRef.addEventListener('click', e => {
        e.stopPropagation();
        clearTimeout(loadTimer);
        blocked.style.display = 'none';
        /* Force reload by briefly clearing src */
        iframe.src = '';
        requestAnimationFrame(() => { iframe.src = url; });
      });
      btnEdit.addEventListener('click', e => {
        e.stopPropagation();
        showEmbedModal(cfg.url, newUrl => {
          cfg.url = newUrl;
          saveWCfg(id, cfg);
          buildEmbed(newUrl);
        });
      });
    }

    /* ── Empty-state screen ── */
    function buildEmpty() {
      body.innerHTML = '';
      const ph = document.createElement('div');
      ph.style.cssText =
        'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'height:100%;gap:10px;padding:16px;text-align:center';
      ph.innerHTML =
        '<div style="font-size:2rem">🌐</div>' +
        '<div style="font-size:.8rem;color:var(--text-muted)">' + t('w_embed_d') + '</div>';
      const setupBtn = document.createElement('button');
      setupBtn.className = 'pom-btn';
      setupBtn.style.marginTop = '4px';
      setupBtn.textContent = t('embed_edit');
      setupBtn.addEventListener('click', e => {
        e.stopPropagation();
        showEmbedModal('', newUrl => {
          if (!newUrl) return;
          cfg.url = newUrl;
          saveWCfg(id, cfg);
          buildEmbed(newUrl);
        });
      });
      ph.appendChild(setupBtn);
      body.appendChild(ph);
    }

    /* ── initial render ── */
    if (cfg.url) {
      buildEmbed(cfg.url);
    } else {
      buildEmpty();
    }
  }
});

/**
 * P9 FIX: Rewrote with createElement — eliminates innerHTML that mixed
 * user-supplied content (esc(currentUrl)), consistent with link modal style.
 */
function showEmbedModal(currentUrl, onSave) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:2100;background:var(--modal-overlay);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center';

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--card);border:1.5px solid var(--card-border);border-radius:16px;padding:24px;width:min(420px,90vw);box-shadow:0 32px 80px rgba(0,0,0,.5)';

  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-size:.9rem;font-weight:700;margin-bottom:14px';
  titleEl.textContent = lang === 'zh' ? '嵌入网页' : 'Embed Website';

  const lblEl = document.createElement('div');
  lblEl.style.cssText = 'font-size:.75rem;color:var(--text-muted);margin-bottom:6px';
  lblEl.textContent = t('embed_url_label');

  const inp = document.createElement('input');
  inp.type = 'url';
  inp.placeholder = t('embed_placeholder');
  inp.value = currentUrl || '';
  inp.style.cssText = 'width:100%;padding:9px 12px;border-radius:9px;border:1.5px solid var(--card-border);background:var(--bg2);color:var(--text);font-family:var(--mono);font-size:.8rem;outline:none;box-sizing:border-box';

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;margin-top:16px;justify-content:flex-end';

  const cancelBtn = document.createElement('button');
  cancelBtn.style.cssText = 'padding:7px 16px;border-radius:9px;border:1.5px solid var(--card-border);background:transparent;color:var(--text-muted);cursor:pointer;font-size:.8rem';
  cancelBtn.textContent = t('cancel');

  const saveBtn = document.createElement('button');
  saveBtn.style.cssText = 'padding:7px 16px;border-radius:9px;border:none;background:var(--accent);color:var(--text-on-accent);cursor:pointer;font-size:.8rem;font-weight:600';
  saveBtn.textContent = lang === 'zh' ? '确定' : 'Save';

  row.append(cancelBtn, saveBtn);
  box.append(titleEl, lblEl, inp, row);
  ov.appendChild(box);
  document.body.appendChild(ov);

  setTimeout(() => inp.focus(), 50);

  const doSave = () => {
    const url = normalizeUrl(inp.value); // P1
    if (!url) return;
    ov.remove(); onSave(url);
  };

  cancelBtn.addEventListener('click', () => ov.remove());
  saveBtn.addEventListener('click', doSave);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter')  doSave();
    if (e.key === 'Escape') ov.remove();
  });
}


