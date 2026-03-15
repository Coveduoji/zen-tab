/* ── LINK ── */
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

      let iconHtml;
      if (customImg) {
        iconHtml = `<img src="${customImg}" alt="" class="lw-custom-img">`;
      } else if (emoji) {
        iconHtml = `<span>${emoji}</span>`;
      } else if (fav) {
        iconHtml = `<img src="${fav}" alt="" class="lw-img" data-fb="${esc(fallbackEmoji)}">`;
      } else {
        iconHtml = `<span>${fallbackEmoji}</span>`;
      }
      body.innerHTML = `<div class="link-widget-body" id="la-${id}" role="link" tabindex="0" title="${esc(cfg.name)}">
        <div class="lw-fav" id="lf-${id}">${iconHtml}</div>
        <div class="lw-name">${esc(cfg.name)}</div>
        <div class="lw-tooltip">${esc(cfg.name)}</div>
      </div>`;

      // Favicon error fallback
      const img = body.querySelector('.lw-img');
      if (img) {
        img.addEventListener('error', () => {
          const fb = document.createElement('span');
          fb.textContent = img.dataset.fb || '🔗';
          img.replaceWith(fb);
        });
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
    // Edit button
    setTimeout(() => {
      const w = body.closest('.widget');
      if (!w) return;
      const ctrl = w.querySelector('.w-controls');
      if (ctrl && !ctrl.querySelector('.edit-lnk-btn')) {
        const eb = document.createElement('button');
        eb.className='w-btn edit-lnk-btn'; eb.textContent='✎'; eb.title='Edit';
        eb.style.cssText='width:22px;height:22px;border-radius:5px;border:none;background:transparent;color:var(--text-muted);cursor:pointer;font-size:.75rem;display:flex;align-items:center;justify-content:center;transition:all .15s';
        eb.onmouseenter=()=>{eb.style.color='var(--text)';eb.style.background='var(--bg)';};
        eb.onmouseleave=()=>{eb.style.color='var(--text-muted)';eb.style.background='transparent';};
        eb.addEventListener('mousedown', e => e.stopPropagation()); // prevent drag system from firing navigation
        eb.addEventListener('click', e => {
          e.stopPropagation();
          e.preventDefault();
          showLinkModal(cfg, saved => {
            cfg.name = saved.name; cfg.url = saved.url;
            if (saved.emoji) cfg.emoji = saved.emoji; else delete cfg.emoji;
            if (saved.customImg) cfg.customImg = saved.customImg; else delete cfg.customImg;
            saveWCfg(id, cfg); draw();
          }, true, id);
        });
        ctrl.insertBefore(eb, ctrl.firstChild);
      }
    }, 0);
    draw();
  }
});


