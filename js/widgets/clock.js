/* ── CLOCK ── */
reg({ type:'clock', get name(){return t('w_clock');}, get desc(){return t('w_clock_d');}, icon:'🕐', cat:'basic',
  render(body, cfg, id) {
    body.innerHTML = `<div class="clock-body" id="cb-${id}"><div class="clock-hm" id="ch-${id}">00:00</div><div class="clock-sec" id="cs-${id}">:00</div><div class="clock-date" id="cd-${id}"></div></div>`;
    function tick() {
      const n=new Date(), h=String(n.getHours()).padStart(2,'0'), m=String(n.getMinutes()).padStart(2,'0'), s=String(n.getSeconds()).padStart(2,'0');
      const e1=document.getElementById(`ch-${id}`); if(!e1)return;
      e1.textContent=`${h}:${m}`;
      document.getElementById(`cs-${id}`).textContent=`:${s}`;
      document.getElementById(`cd-${id}`).textContent = lang==='zh'
        ? `${WD_ZH[n.getDay()]} · ${n.getMonth()+1}月${n.getDate()}日`
        : `${WD_EN[n.getDay()]} ${MO_EN[n.getMonth()]} ${n.getDate()}`;
    }
    tick();
    let iv = setInterval(tick, 1000);
    registerTimer(id, iv);
    // Pause when tab is hidden to save CPU; resume with immediate tick when visible.
    // Cleanup is tied to widget removal via registerCleanup instead of the
    // listener trying to self-detect its own element is gone.
    function onVis() {
      if (document.hidden) { clearInterval(iv); }
      else { tick(); iv = setInterval(tick, 1000); registerTimer(id, iv); }
    }
    document.addEventListener('visibilitychange', onVis);
    registerCleanup(id, () => document.removeEventListener('visibilitychange', onVis));

    /* ── Responsive scale: shared helper (also used by pomodoro/weather) ── */
    const clockWidget = body.closest('.widget');
    const clockBody = document.getElementById(`cb-${id}`);
    // natural size of .clock-body: hm line ~3rem mono + date line, ~170x90px
    if (clockWidget && clockBody) {
      attachAutoScale(id, clockWidget, clockBody, 170, 90, { minScale: 0.6, maxScale: 1.8, padX: 16, padY: 16, headerH: 34 });
    }
  }
});

