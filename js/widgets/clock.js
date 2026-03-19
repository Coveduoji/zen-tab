/* ── CLOCK ── */
reg({ type:'clock', get name(){return t('w_clock');}, get desc(){return t('w_clock_d');}, icon:'🕐', cat:'basic',
  render(body, cfg, id) {
    body.innerHTML = `<div class="clock-body"><div class="clock-hm" id="ch-${id}">00:00</div><div class="clock-sec" id="cs-${id}">:00</div><div class="clock-date" id="cd-${id}"></div></div>`;
    // Cache element refs — no getElementById on every tick
    const hmEl   = document.getElementById(`ch-${id}`);
    const secEl  = document.getElementById(`cs-${id}`);
    const dateEl = document.getElementById(`cd-${id}`);
    function tick() {
      if (!hmEl) return;
      const n = new Date();
      const h = String(n.getHours()).padStart(2,'0');
      const m = String(n.getMinutes()).padStart(2,'0');
      const s = String(n.getSeconds()).padStart(2,'0');
      hmEl.textContent   = `${h}:${m}`;
      secEl.textContent  = `:${s}`;
      dateEl.textContent = lang === 'zh'
        ? `${WD_ZH[n.getDay()]} · ${n.getMonth()+1}月${n.getDate()}日`
        : `${WD_EN[n.getDay()]} ${MO_EN[n.getMonth()]} ${n.getDate()}`;
    }
    tick(); registerTimer(id, setInterval(tick, 1000));
  }
});
