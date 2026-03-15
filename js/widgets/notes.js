/* ── NOTES ── */
reg({ type:'notes', get name(){return t('w_notes');}, get desc(){return t('w_notes_d');}, icon:'📝', cat:'basic',
  render(body, cfg, id) {
    cfg.content = cfg.content || '';
    cfg.fontSize = cfg.fontSize || 16;

    const ph = t('notes_ph');
    body.innerHTML = `<textarea class="notes-ta" placeholder="${ph}">${esc(cfg.content)}</textarea>`;
    const ta = body.querySelector('textarea');

    // Apply saved font size
    ta.style.fontSize = cfg.fontSize + 'px';

    // Stop mousedown so drag system does not capture textarea interactions
    ta.addEventListener('mousedown', e => e.stopPropagation());
    ta.addEventListener('click',     e => e.stopPropagation());

    // Auto-save on input (debounced) and on blur
    let timer;
    function persist() { cfg.content = ta.value; saveWCfg(id, cfg); }
    ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(persist, 400); });
    ta.addEventListener('blur',  () => { clearTimeout(timer); persist(); });

    // Inject font-size buttons into w-controls (deferred so DOM is ready)
    setTimeout(() => {
      const w = body.closest('.widget');
      if (!w) return;
      const ctrl = w.querySelector('.w-controls');
      if (!ctrl || ctrl.querySelector('.notes-fs-bar')) return;

      const bar = document.createElement('div');
      bar.className = 'notes-fs-bar';

      const MIN = 14, MAX = 32, STEP = 2;
      const btnMinus = document.createElement('button');
      const btnPlus  = document.createElement('button');
      btnMinus.className = 'notes-fs-btn'; btnMinus.textContent = 'A−'; btnMinus.title = t('notes_font_dec');
      btnPlus.className  = 'notes-fs-btn'; btnPlus.textContent  = 'A+'; btnPlus.title  = t('notes_font_inc');

      function updateButtons() {
        btnMinus.disabled = cfg.fontSize <= MIN;
        btnPlus.disabled  = cfg.fontSize >= MAX;
      }
      updateButtons();

      btnMinus.addEventListener('click', e => {
        e.stopPropagation();
        if (cfg.fontSize <= MIN) return;
        cfg.fontSize = Math.max(MIN, cfg.fontSize - STEP);
        ta.style.fontSize = cfg.fontSize + 'px';
        saveWCfg(id, cfg); updateButtons();
      });
      btnPlus.addEventListener('click', e => {
        e.stopPropagation();
        if (cfg.fontSize >= MAX) return;
        cfg.fontSize = Math.min(MAX, cfg.fontSize + STEP);
        ta.style.fontSize = cfg.fontSize + 'px';
        saveWCfg(id, cfg); updateButtons();
      });

      bar.appendChild(btnMinus);
      bar.appendChild(btnPlus);
      ctrl.insertBefore(bar, ctrl.firstChild);
    }, 0);
  }
});

/* ── TODO placeholder ── */

