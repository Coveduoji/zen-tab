/* ── CLOCK ── */
reg({ type:'clock', get name(){return t('w_clock');}, get desc(){return t('w_clock_d');}, icon:'🕐', cat:'basic',
  render(body, cfg, id) {
    body.innerHTML = `<div class="clock-body"><div class="clock-hm">00:00</div><div class="clock-sec">:00</div><div class="clock-date"></div></div>`;
    // Query inside the detached widget body: document.getElementById() cannot
    // see nodes until the widget is appended to the canvas.
    const hmEl = body.querySelector('.clock-hm');
    const secEl = body.querySelector('.clock-sec');
    const dateEl = body.querySelector('.clock-date');
    let lastDate = '';
    let lastHm = '';

    function tick() {
      const n = new Date();
      const h = String(n.getHours()).padStart(2,'0');
      const m = String(n.getMinutes()).padStart(2,'0');
      const s = String(n.getSeconds()).padStart(2,'0');
      const hm = `${h}:${m}`;
      if (hm !== lastHm) { hmEl.textContent = hm; lastHm = hm; }
      secEl.textContent = `:${s}`;
      // The date only changes once a day; don't touch the DOM every second.
      const ds = lang==='zh'
        ? `${WD_ZH[n.getDay()]} · ${n.getMonth()+1}月${n.getDate()}日`
        : `${WD_EN[n.getDay()]} ${MO_EN[n.getMonth()]} ${n.getDate()}`;
      if (ds !== lastDate) { dateEl.textContent = ds; lastDate = ds; }
    }

    tick();
    // Shared second-aligned ticker (js/core/ticker.js), suspended in pure mode.
    registerCleanup(id, onSecond(tick, { widget: true }));

    /* ── Responsive scale: shared helper (also used by pomodoro/weather) ── */
    const clockWidget = body.closest('.widget');
    const clockBody = body.querySelector('.clock-body');
    // natural size of .clock-body: hm line ~3rem mono + date line, ~170x90px
    if (clockWidget && clockBody) {
      attachAutoScale(id, clockWidget, clockBody, 170, 90, { minScale: 0.6, maxScale: 1.8, padX: 16, padY: 16, headerH: 34 });
    }
  }
});
