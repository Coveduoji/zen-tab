/* ── POMODORO ── */
reg({ type:'pomodoro', get name(){return t('w_pomodoro');}, get desc(){return t('w_pomodoro_d');}, icon:'🍅', cat:'pro',
  render(body, cfg, id) {
    /* ── constants ── */
    const WORK_S = 25 * 60;
    const BRK_S  =  5 * 60;
    const R = 40;
    const C = 2 * Math.PI * R;        // full circumference ≈ 251.3

    /* ── mutable state (closure — no global pollution) ── */
    let phase    = 'idle';             // idle | running | paused | finished
    let mode     = 'work';             // work | break
    let rem      = WORK_S;
    let iv       = null;
    let pomCustomSecs = WORK_S;       // FIX: tracks user-set duration for this instance

    /* ── audio beep ── */
    function beep() {
      try {
        const ac  = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ac.createOscillator();
        const g   = ac.createGain();
        osc.connect(g); g.connect(ac.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ac.currentTime);
        g.gain.setValueAtTime(0.35, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.9);
        osc.start(); osc.stop(ac.currentTime + 0.9);
      } catch(_) {}
    }

    /* ── build DOM once — never rebuild ── */
    const wrap = document.createElement('div');
    wrap.className = 'pom-wrap';
    wrap.innerHTML =
      '<div class="pom-ring">' +
        '<svg width="96" height="96" viewBox="0 0 96 96">' +
          '<circle class="pom-ring-bg" cx="48" cy="48" r="' + R + '" stroke-width="5"/>' +
          '<circle class="pom-ring-fill" cx="48" cy="48" r="' + R + '" stroke-width="5"' +
            ' stroke-dasharray="' + C.toFixed(2) + '"' +
            ' stroke-dashoffset="' + C.toFixed(2) + '"/>' +
        '</svg>' +
        '<div class="pom-time">25:00</div>' +
      '</div>' +
      '<div class="pom-label"></div>' +
      '<div class="pom-btns">' +
        '<button class="pom-btn pom-mode-btn" title=""></button>' +
        '<button class="pom-btn pom-start-btn"></button>' +
        '<button class="pom-btn pom-reset-btn">↺</button>' +
      '</div>';
    body.appendChild(wrap);

    /* Prevent pointer events from bubbling to widget drag system */
    wrap.addEventListener('mousedown', e => {
      if (e.target.tagName === 'BUTTON') e.stopPropagation();
    });

    /* ── cache DOM refs — safe because we never replace these nodes ── */
    const ringFill = wrap.querySelector('.pom-ring-fill');
    const timeEl   = wrap.querySelector('.pom-time');
    const labelEl  = wrap.querySelector('.pom-label');
    const startBtn = wrap.querySelector('.pom-start-btn');
    const resetBtn = wrap.querySelector('.pom-reset-btn');
    const modeBtn  = wrap.querySelector('.pom-mode-btn');

    /* ── pure render: only mutates attributes/text, no innerHTML ── */
    function paint() {
      const total   = mode === 'work' ? pomCustomSecs : BRK_S;
      const offset  = C * (rem / total);
      const mm      = String(Math.floor(rem / 60)).padStart(2, '0');
      const ss      = String(rem % 60).padStart(2, '0');

      ringFill.style.strokeDashoffset = offset;
      ringFill.style.stroke = mode === 'work' ? 'var(--accent2)' : 'var(--accent3)';
      timeEl.textContent  = mm + ':' + ss;
      labelEl.textContent = mode === 'work' ? t('pom_focus') : t('pom_break');

      // Mode toggle button: shows the opposite mode as a switch target
      modeBtn.textContent = mode === 'work' ? '☕' : '🍅';
      modeBtn.title = mode === 'work' ? t('pom_switch_break') : t('pom_switch_focus');

      if (phase === 'running') {
        startBtn.textContent = '⏸';
        startBtn.classList.add('on');
      } else {
        startBtn.textContent = '▶';
        startBtn.classList.remove('on');
      }
    }

    /* ── tick ── */
    function tick() {
      rem = Math.max(0, rem - 1);
      if (rem === 0) {
        phase = 'finished';
        clearInterval(iv); iv = null;
        beep();
        // FIX: show finish modal in addition to toast
        showFinishModal();
        toast(mode === 'work' ? t('pom_finished_work') : t('pom_finished_break'), 'ok');
        // auto-flip after 1.5 s
        setTimeout(() => {
          mode  = mode === 'work' ? 'break' : 'work';
          // FIX: work mode uses pomCustomSecs, break uses BRK_S
          rem   = mode === 'work' ? pomCustomSecs : BRK_S;
          phase = 'idle';
          paint();
        }, 1500);
      }
      paint();
    }

    /* ── controls ── */
    startBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (pomWidget && pomWidget._wasDragged) return;
      if (phase === 'running') {
        phase = 'paused';
        clearInterval(iv); iv = null;
      } else {
        phase = 'running';
        iv = setInterval(tick, 1000);
        registerTimer(id, iv);
      }
      paint();
    });

    resetBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (pomWidget && pomWidget._wasDragged) return;
      clearInterval(iv); iv = null;
      phase = 'idle';
      rem   = mode === 'work' ? pomCustomSecs : BRK_S;
      paint();
    });

    // Switch between focus and break modes — stops timer and resets to new mode
    modeBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (pomWidget && pomWidget._wasDragged) return;
      clearInterval(iv); iv = null;
      mode  = mode === 'work' ? 'break' : 'work';
      phase = 'idle';
      rem   = mode === 'work' ? pomCustomSecs : BRK_S;
      paint();
    });

    /* ── FEATURE: Click pom-time to open set-time modal ── */
    timeEl.style.cursor = 'pointer';
      timeEl.title = t('pom_set_time');
      timeEl.addEventListener('click', e => {
      e.stopPropagation();
      if (pomWidget && pomWidget._wasDragged) return;
      const wasRunning = phase === 'running';
      if (wasRunning) { phase = 'paused'; clearInterval(iv); iv = null; paint(); }

      const curMins = Math.ceil(rem / 60) || (mode === 'work' ? 25 : 5);
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;z-index:2500;background:var(--modal-overlay);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;animation:fadeIn .18s ease';
      const box = document.createElement('div');
      box.style.cssText = 'background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r);padding:28px;width:320px;box-shadow:var(--shadow);animation:cmdIn .18s var(--ease)';
      const titleEl2 = document.createElement('div');
      titleEl2.style.cssText = 'font-size:.95rem;font-weight:700;margin-bottom:14px;color:var(--text)';
      titleEl2.textContent = t('pom_set_time_title');
      const lbl2 = document.createElement('div');
      lbl2.style.cssText = 'font-size:.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px';
      lbl2.textContent = t('pom_minutes');

      const presets = document.createElement('div');
      presets.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px';
      const presetMins = [25, 30, 45, 60];
      presetMins.forEach(m => {
        const btn = document.createElement('button');
        btn.textContent = m + t('pom_min_unit');
        btn.style.cssText = 'flex:1;min-width:44px;padding:5px 4px;border-radius:var(--r-sm);border:1.5px solid var(--card-border);background:var(--bg2);color:var(--text-muted);font-size:.72rem;cursor:pointer;transition:all var(--t);font-family:var(--body)';
        btn.addEventListener('mouseenter', () => { btn.style.borderColor = 'var(--accent)'; btn.style.color = 'var(--accent)'; });
        btn.addEventListener('mouseleave', () => {
          const active = parseInt(inp2.value, 10) === m;
          btn.style.borderColor = active ? 'var(--accent)' : 'var(--card-border)';
          btn.style.color = active ? 'var(--accent)' : 'var(--text-muted)';
        });
        btn.addEventListener('click', () => {
          inp2.value = m;
          presets.querySelectorAll('button').forEach(b => {
            b.style.borderColor = 'var(--card-border)';
            b.style.color = 'var(--text-muted)';
            b.style.background = 'var(--bg2)';
          });
          btn.style.borderColor = 'var(--accent)';
          btn.style.color = 'var(--accent)';
          btn.style.background = 'transparent';
        });
        presets.appendChild(btn);
      });

      const inp2 = document.createElement('input');
      inp2.type = 'number'; inp2.min = 1; inp2.max = 90; inp2.value = curMins;
      inp2.style.cssText = 'width:100%;background:var(--bg2);border:1.5px solid var(--card-border);border-radius:var(--r-sm);color:var(--text);font-family:var(--mono);font-size:1.1rem;padding:8px 11px;outline:none;transition:border-color var(--t);box-sizing:border-box;text-align:center';
      inp2.addEventListener('focus', () => inp2.style.borderColor = 'var(--accent)');
      inp2.addEventListener('blur',  () => inp2.style.borderColor = 'var(--card-border)');
      const row2 = document.createElement('div');
      row2.style.cssText = 'display:flex;gap:7px;justify-content:flex-end;margin-top:14px';
      const cancelBtn2 = document.createElement('button');
      cancelBtn2.className = 'btn-s'; cancelBtn2.textContent = t('cancel');
      const okBtn2 = document.createElement('button');
      okBtn2.className = 'btn-p'; okBtn2.textContent = t('pom_confirm');
      const closeModal2 = () => ov.remove();
      cancelBtn2.addEventListener('click', closeModal2);
      ov.addEventListener('click', e2 => { if (e2.target === ov) closeModal2(); });
      okBtn2.addEventListener('click', () => {
        const mins = parseInt(inp2.value, 10);
        if (!mins || mins < 1 || mins > 90) return;
        clearInterval(iv); iv = null;
        phase = 'idle';
        rem = mins * 60;
        pomCustomSecs = mins * 60;
        paint();
        closeModal2();
      });
      row2.append(cancelBtn2, okBtn2);
      box.append(titleEl2, lbl2, presets, inp2, row2);

      presets.querySelectorAll('button').forEach(btn => {
        const m = parseInt(btn.textContent);
        if (m === curMins) {
          btn.style.borderColor = 'var(--accent)';
          btn.style.color = 'var(--accent)';
        }
      });
      ov.appendChild(box);
      document.body.appendChild(ov);
      setTimeout(() => { inp2.focus(); inp2.select(); }, 60);
      inp2.addEventListener('keydown', e2 => {
        if (e2.key === 'Enter') okBtn2.click();
        if (e2.key === 'Escape') closeModal2();
      });
    });

    function showFinishModal() {
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;z-index:2500;background:var(--modal-overlay);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;animation:fadeIn .18s ease';
      const box = document.createElement('div');
      box.style.cssText = 'background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r);padding:28px 22px;width:280px;box-shadow:var(--shadow);text-align:center;animation:cmdIn .18s var(--ease)';
      const ico = document.createElement('div');
      ico.style.cssText = 'font-size:2.5rem;margin-bottom:10px';
      ico.textContent = mode === 'work' ? '🍅' : '☕';
      const tEl = document.createElement('div');
      tEl.style.cssText = 'font-size:1rem;font-weight:700;margin-bottom:8px;color:var(--text)';
      tEl.textContent = mode === 'work' ? t('pom_work_done_t') : t('pom_break_done_t');
      const sEl = document.createElement('div');
      sEl.style.cssText = 'font-size:.8rem;color:var(--text-muted);margin-bottom:18px;line-height:1.6';
      sEl.textContent = mode === 'work' ? t('pom_work_done_s') : t('pom_break_done_s');
      const okBtn3 = document.createElement('button');
      okBtn3.className = 'btn-p';
      okBtn3.style.cssText = 'width:100%;padding:10px 0;font-size:.9rem';
      okBtn3.textContent = t('pom_got_it');
      okBtn3.addEventListener('click', () => ov.remove());
      box.append(ico, tEl, sEl, okBtn3);
      ov.appendChild(box);
      document.body.appendChild(ov);
      setTimeout(() => okBtn3.focus(), 60);
    }

    /* ── initial render ── */
    paint();

    /* ── Responsive scale: shared helper (also used by clock/weather) ── */
    const pomWidget = body.closest('.widget');
    // pom-wrap 的自然尺寸：ring 96 + label 14 + btns 36 + gap*2(8px) + padding 16 = 178px 高，96px 宽
    if (pomWidget) {
      attachAutoScale(id, pomWidget, wrap, 96, 178, { minScale: 0.5, maxScale: 1.5, padX: 16, padY: 16, headerH: 34 });
    }
  }
});


