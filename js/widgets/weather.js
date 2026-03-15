let _weatherPos = null; // { latitude, longitude } or null

reg({ type:'weather', get name(){return t('w_weather');}, get desc(){return t('w_weather_d');}, icon:'🌤', cat:'info',
  render(body, cfg, id) {
    const WMO = {0:'☀️',1:'🌤',2:'⛅',3:'☁️',45:'🌫',51:'🌦',61:'🌧',65:'🌧',71:'❄️',80:'🌦',95:'⛈'};
    const DZH = {0:'晴',1:'晴间多云',2:'多云',3:'阴',45:'雾',51:'毛毛雨',61:'小雨',65:'大雨',71:'小雪',80:'阵雨',95:'雷暴'};
    const DEN = {0:'Clear',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Foggy',51:'Drizzle',61:'Light rain',65:'Heavy rain',71:'Light snow',80:'Showers',95:'Thunderstorm'};
    const DOWS_ZH = ['日','一','二','三','四','五','六'];
    const DOWS_EN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    /* ── P2: use shared cache factory instead of inline loadCache/saveCache ── */
    const weatherCache = makeLocalCache('weather_cache_v2', 10 * 60 * 1000);

    /* ── Main widget DOM — horizontal layout ── */
    const wrap = document.createElement('div');
    wrap.className = 'weather-body';
    wrap.style.cssText = 'position:relative;cursor:pointer;';

    // inner row: icon left + info right
    const row = document.createElement('div');
    row.className = 'we-row';

    const iconEl = document.createElement('div'); iconEl.className = 'we-icon';
    const infoEl = document.createElement('div'); infoEl.className = 'we-info';
    const tempEl = document.createElement('div'); tempEl.className = 'we-temp';
    const descEl = document.createElement('div'); descEl.className = 'we-desc';
    const cityEl = document.createElement('div'); cityEl.className = 'we-city';
    const msgEl  = document.createElement('div'); msgEl.className  = 'we-msg';

    infoEl.append(tempEl, descEl, cityEl);
    row.append(iconEl, infoEl);
    wrap.append(row, msgEl);

    const refreshBtn = document.createElement('button');
    refreshBtn.title = t('weather_refresh');
    refreshBtn.style.cssText =
      'position:absolute;top:4px;right:4px;width:24px;height:24px;border-radius:6px;' +
      'border:none;background:transparent;color:var(--text-muted);cursor:pointer;' +
      'font-size:.9rem;display:flex;align-items:center;justify-content:center;' +
      'opacity:0;transition:opacity var(--t),background var(--t);';
    refreshBtn.textContent = '⟳';
    wrap.appendChild(refreshBtn);

    body.appendChild(wrap);

    function showMsg(msg) {
      row.style.display = 'none';
      msgEl.textContent = msg;
    }
    function showData(d) {
      row.style.display = '';
      iconEl.textContent = d.icon;
      tempEl.textContent = d.temp + '°';
      descEl.textContent = d.desc;
      cityEl.textContent = d.city || '';
      msgEl.textContent  = '';
    }

    wrap.addEventListener('mouseenter', () => refreshBtn.style.opacity = '1');
    wrap.addEventListener('mouseleave', () => refreshBtn.style.opacity = '0');

    /* ── 7-day forecast modal ── */
    function openForecastModal(fullData) {
      const existing = document.getElementById('weather-forecast-modal');
      if (existing) { existing.remove(); return; }

      const ov = document.createElement('div');
      ov.id = 'weather-forecast-modal';
      ov.className = 'weather-modal-ov';

      const modal = document.createElement('div');
      modal.className = 'weather-modal';

      /* header */
      const hd = document.createElement('div'); hd.className = 'wm-hd';
      const cityInfo = document.createElement('div');
      const cityName = document.createElement('div'); cityName.className = 'wm-city';
      cityName.textContent = fullData.city || '—';
      const dateStr = document.createElement('div'); dateStr.className = 'wm-date';
      const now = new Date();
      dateStr.textContent = lang === 'zh'
        ? `${now.getMonth()+1}月${now.getDate()}日`
        : now.toLocaleDateString('en-US', {month:'long', day:'numeric'});
      cityInfo.append(cityName, dateStr);
      const closeBtn = document.createElement('button');
      closeBtn.className = 'wm-close'; closeBtn.textContent = '×';
      hd.append(cityInfo, closeBtn);

      /* today strip */
      const todayDiv = document.createElement('div'); todayDiv.className = 'wm-today';
      const todayIcon = document.createElement('div'); todayIcon.className = 'wm-today-icon';
      todayIcon.textContent = fullData.icon;
      const todayInfo = document.createElement('div'); todayInfo.className = 'wm-today-info';
      const todayTemp = document.createElement('div'); todayTemp.className = 'wm-today-temp';
      todayTemp.textContent = fullData.temp + '°';
      const todayDesc = document.createElement('div'); todayDesc.className = 'wm-today-desc';
      todayDesc.textContent = fullData.desc;
      const todayFeel = document.createElement('div'); todayFeel.className = 'wm-today-feel';
      todayFeel.textContent = lang === 'zh' ? '点击外部关闭' : 'Click outside to close';
      todayInfo.append(todayTemp, todayDesc, todayFeel);
      todayDiv.append(todayIcon, todayInfo);

      /* 7-day grid */
      const weekDiv = document.createElement('div'); weekDiv.className = 'wm-week';
      const days = fullData.daily || [];
      days.forEach((day, i) => {
        const col = document.createElement('div');
        col.className = 'wm-day' + (i === 0 ? ' today-day' : '');
        const dow = document.createElement('div'); dow.className = 'wm-day-dow';
        const d = new Date(); d.setDate(d.getDate() + i);
        dow.textContent = i === 0
          ? (lang === 'zh' ? '今天' : 'Today')
          : (lang === 'zh' ? DOWS_ZH[d.getDay()] : DOWS_EN[d.getDay()]);
        const ico = document.createElement('div'); ico.className = 'wm-day-icon';
        ico.textContent = WMO[day.code] || '🌡';
        const hi = document.createElement('div'); hi.className = 'wm-day-hi';
        hi.textContent = Math.round(day.hi) + '°';
        const lo = document.createElement('div'); lo.className = 'wm-day-lo';
        lo.textContent = Math.round(day.lo) + '°';
        col.append(dow, ico, hi, lo);
        weekDiv.appendChild(col);
      });

      modal.append(hd, todayDiv, weekDiv);
      ov.appendChild(modal);
      document.body.appendChild(ov);

      closeBtn.addEventListener('click', e => { e.stopPropagation(); ov.remove(); });
      ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
      document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', esc); }
      });
    }

    /* ── Fetch with 7-day data ── */
    function fetchWeather(force) {
      if (!force) {
        const cached = weatherCache.load();
        if (cached) { showData(cached); return; }
      }
      showMsg(t('weather_loading'));

      function doFetch(la, lo) {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}` +
          `&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min` +
          `&timezone=auto&forecast_days=7`;
        fetch(url)
          .then(r => r.json())
          .then(d => {
            const cw   = d.current_weather;
            const icon = WMO[cw.weathercode] || '🌡';
            const desc = (lang === 'zh' ? DZH : DEN)[cw.weathercode] || '';
            const temp = Math.round(cw.temperature);
            const daily = (d.daily?.weathercode || []).map((code, i) => ({
              code,
              hi: d.daily.temperature_2m_max[i],
              lo: d.daily.temperature_2m_min[i],
            }));
            fetch(`https://nominatim.openstreetmap.org/reverse?lat=${la}&lon=${lo}&format=json`)
              .then(r => r.json())
              .then(geo => {
                const city = geo.address?.city || geo.address?.town || geo.address?.village || '—';
                const data = { icon, temp, desc, city, daily };
                weatherCache.save(data); showData(data);
              })
              .catch(() => {
                const data = { icon, temp, desc, city: '—', daily };
                weatherCache.save(data); showData(data);
              });
          })
          .catch(() => showMsg(t('weather_error')));
      }

      // Re-use position from this session — avoids prompting on every renderAll()
      if (_weatherPos) {
        doFetch(_weatherPos.latitude, _weatherPos.longitude);
        return;
      }
      if (!navigator.geolocation) { showMsg(t('weather_ns')); return; }
      navigator.geolocation.getCurrentPosition(pos => {
        _weatherPos = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        doFetch(_weatherPos.latitude, _weatherPos.longitude);
      }, () => {
        // Permission denied — show persistent prompt instead of a fleeting toast
        row.style.display = 'none';
        msgEl.innerHTML = '';
        const permDiv = document.createElement('div');
        permDiv.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 0;';
        const permText = document.createElement('div');
        permText.style.cssText = 'font-size:.78rem;color:var(--text-muted);text-align:center;line-height:1.4;';
        permText.textContent = t('weather_allow');
        const permBtn = document.createElement('button');
        permBtn.style.cssText = 'padding:4px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface-glass);color:var(--text);cursor:pointer;font-size:.75rem;';
        permBtn.textContent = lang === 'zh' ? '重新授权' : 'Grant Access';
        permBtn.addEventListener('click', e => {
          e.stopPropagation();
          msgEl.innerHTML = '';
          fetchWeather(true);
        });
        permDiv.append(permText, permBtn);
        msgEl.appendChild(permDiv);
      });
    }

    /* ── Events ── */
    refreshBtn.addEventListener('click', e => {
      e.stopPropagation();
      fetchWeather(true);
    });

    wrap.addEventListener('click', e => {
      if (e.target === refreshBtn) return;
      e.stopPropagation();
      if (weatherWidget && weatherWidget._wasDragged) return;
      const cached = weatherCache.load();
      if (cached && cached.daily) {
        openForecastModal(cached);
      } else {
        fetchWeather(false);
        setTimeout(() => {
          const c2 = weatherCache.load();
          if (c2 && c2.daily) openForecastModal(c2);
        }, 3000);
      }
    });

    fetchWeather(false);

    /* ── Responsive scale: same approach as pomodoro ── */
    const weatherWidget = body.closest('.widget');
    // natural size of .we-row: icon ~3.2rem + info ~80px wide, total ~120x80px
    const NAT_W = 130;
    const NAT_H = 70;
    const HEADER_H = 34;

    function applyWeatherScale() {
      if (!weatherWidget) return;
      const bw = weatherWidget.offsetWidth;
      const bh = weatherWidget.offsetHeight;
      if (!bw || !bh) return;
      const availW = bw - 24;
      const availH = bh - HEADER_H - 24;
      const scale = Math.min(availW / NAT_W, availH / NAT_H);
      const clamped = Math.min(Math.max(scale, 0.6), 2.5);
      row.style.transform = `scale(${clamped.toFixed(4)})`;
    }

    requestAnimationFrame(applyWeatherScale);

    if (typeof ResizeObserver !== 'undefined' && weatherWidget) {
      const ro = new ResizeObserver(applyWeatherScale);
      ro.observe(weatherWidget);
      // Store disconnect in widget element for ResizeObserver teardown
      weatherWidget._roDisconnect = () => ro.disconnect();
    }
  }
});

