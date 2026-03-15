/* ── CLOCK ── */
reg({ type:'clock', get name(){return t('w_clock');}, get desc(){return t('w_clock_d');}, icon:'🕐', cat:'basic',
  render(body, cfg, id) {
    body.innerHTML = `<div class="clock-body"><div class="clock-hm" id="ch-${id}">00:00</div><div class="clock-sec" id="cs-${id}">:00</div><div class="clock-date" id="cd-${id}"></div></div>`;
    function tick() {
      const n=new Date(), h=String(n.getHours()).padStart(2,'0'), m=String(n.getMinutes()).padStart(2,'0'), s=String(n.getSeconds()).padStart(2,'0');
      const e1=document.getElementById(`ch-${id}`); if(!e1)return;
      e1.textContent=`${h}:${m}`;
      document.getElementById(`cs-${id}`).textContent=`:${s}`;
      document.getElementById(`cd-${id}`).textContent = lang==='zh'
        ? `${WD_ZH[n.getDay()]} · ${n.getMonth()+1}月${n.getDate()}日`
        : `${WD_EN[n.getDay()]} ${MO_EN[n.getMonth()]} ${n.getDate()}`;
    }
    tick(); registerTimer(id, setInterval(tick, 1000));
  }
});


