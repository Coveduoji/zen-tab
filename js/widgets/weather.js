/* Weather data is shared by every weather widget on the page: one
   geolocation prompt, one Open-Meteo request, one Nominatim lookup per city. */
const WMO = {0:'☀️',1:'🌤',2:'⛅',3:'☁️',45:'🌫',51:'🌦',61:'🌧',65:'🌧',71:'❄️',80:'🌦',95:'⛈'};
const DZH = {0:'晴',1:'晴间多云',2:'多云',3:'阴',45:'雾',51:'毛毛雨',61:'小雨',65:'大雨',71:'小雪',80:'阵雨',95:'雷暴'};
const DEN = {0:'Clear',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Foggy',51:'Drizzle',61:'Light rain',65:'Heavy rain',71:'Light snow',80:'Showers',95:'Thunderstorm'};
const DOWS_ZH = ['日','一','二','三','四','五','六'];
const DOWS_EN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const _weatherCache = makeLocalCache('weather_cache_v2', 10 * 60 * 1000);
const _cityCache = makeLocalCache('weather_city_v1', 7 * 24 * 60 * 60 * 1000);
let _weatherPos = null;          // { latitude, longitude } for this session
let _weatherPosPromise = null;
let _weatherFetchPromise = null;
let _weatherFetchKey = '';

function _timeoutSignal(ms) {
  try { return AbortSignal.timeout(ms); } catch (_) { return undefined; }
}

function _getWeatherPosition() {
  if (_weatherPos) return Promise.resolve(_weatherPos);
  if (_weatherPosPromise) return _weatherPosPromise;
  if (!navigator.geolocation) return Promise.reject(new Error('unsupported'));
  _weatherPosPromise = new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      pos => {
        _weatherPos = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        resolve(_weatherPos);
      },
      err => { _weatherPosPromise = null; reject(err); },
      { timeout: 8000, maximumAge: 5 * 60 * 1000 }
    );
  });
  return _weatherPosPromise;
}

function _fetchWeatherData(la, lo) {
  const key = la.toFixed(3) + ',' + lo.toFixed(3);
  if (_weatherFetchPromise && _weatherFetchKey === key) return _weatherFetchPromise;
  _weatherFetchKey = key;

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}` +
    `&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min` +
    `&timezone=auto&forecast_days=7`;

  const cachedCity = (_cityCache.load() || _cityCache.loadStale() || {})[key] || '';
  const cityPromise = cachedCity
    ? Promise.resolve(cachedCity)
    : fetch(`https://nominatim.openstreetmap.org/reverse?lat=${la}&lon=${lo}&format=json`, { signal: _timeoutSignal(8000) })
        .then(r => r.json())
        .then(geo => geo.address?.city || geo.address?.town || geo.address?.village || '')
        .catch(() => '');

  const p = Promise.all([
    fetch(weatherUrl, { signal: _timeoutSignal(8000) }).then(r => r.json()),
    cityPromise,
  ]).then(([d, city]) => {
    const cw = d.current_weather;
    const data = {
      icon: WMO[cw.weathercode] || '🌡',
      desc: (lang === 'zh' ? DZH : DEN)[cw.weathercode] || '',
      temp: Math.round(cw.temperature),
      city: city || '—',
      daily: (d.daily?.weathercode || []).map((code, i) => ({
        code,
        hi: d.daily.temperature_2m_max[i],
        lo: d.daily.temperature_2m_min[i],
      })),
    };
    if (city) {
      const map = _cityCache.loadStale() || {};
      map[key] = city;
      _cityCache.save(map);
    }
    _weatherCache.save(data);
    return data;
  });

  _weatherFetchPromise = p;
  const clear = () => {
    if (_weatherFetchPromise === p) { _weatherFetchPromise = null; _weatherFetchKey = ''; }
  };
  p.then(clear, clear);
  return p;
}

reg({ type:'weather', get name(){return t('w_weather');}, get desc(){return t('w_weather_d');}, icon:'🌤', cat:'info',
  render(body, cfg, id) {

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
      if (existing) {
        const sameWidget = existing.dataset.ownerId === id;
        existing.remove();
        // Clicking the widget that already owns the open modal just closes
        // it (toggle). Clicking a *different* weather widget instance
        // replaces it with that widget's own forecast instead of only
        // closing whatever happened to be open.
        if (sameWidget) return;
      }

      const ov = document.createElement('div');
      ov.id = 'weather-forecast-modal';
      ov.dataset.ownerId = id;
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

      // Every close path must remove the Escape listener — previously it
      // only cleaned itself up when Escape was the thing that closed the
      // modal, so closing via the × button or an outside click leaked one
      // "keydown" listener on document per open/close cycle.
      function escHandler(e) { if (e.key === 'Escape') closeModal(); }
      function closeModal() {
        ov.remove();
        document.removeEventListener('keydown', escHandler);
      }
      closeBtn.addEventListener('click', e => { e.stopPropagation(); closeModal(); });
      ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });
      document.addEventListener('keydown', escHandler);
    }

    function showPermission() {
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
    }

    /* ── Fetch with 7-day data (shared across widget instances) ── */
    function fetchWeather(force) {
      if (!force) {
        const cached = _weatherCache.load();
        if (cached) { showData(cached); return; }
      }
      // Offline: show stale cache or a brief message — don't attempt network
      if (!navigator.onLine) {
        const stale = _weatherCache.loadStale();
        if (stale) { showData(stale); return; }
        showMsg(lang === 'zh' ? '⚡ 离线' : '⚡ Offline');
        return;
      }
      showMsg(t('weather_loading'));

      _getWeatherPosition().then(pos => {
        return _fetchWeatherData(pos.latitude, pos.longitude).then(data => {
          if (body.isConnected) showData(data);
        }, () => {
          if (body.isConnected) showMsg(t('weather_error'));
        });
      }, err => {
        if (!body.isConnected) return;
        if (err && err.message === 'unsupported') showMsg(t('weather_ns'));
        else showPermission();
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
      const cached = _weatherCache.load();
      if (cached && cached.daily) {
        openForecastModal(cached);
      } else {
        fetchWeather(false);
        registerTimer(id, setTimeout(() => {
          const c2 = _weatherCache.load();
          if (c2 && c2.daily && body.isConnected) openForecastModal(c2);
        }, 3000));
      }
    });

    // Render cached data immediately; only hit the network once the page is
    // idle, so weather can never delay first paint.
    const initial = _weatherCache.load();
    if (initial) {
      showData(initial);
    } else if (!navigator.onLine) {
      fetchWeather(false);
    } else if (window.requestIdleCallback) {
      showMsg(t('weather_loading'));
      requestIdleCallback(() => { if (body.isConnected) fetchWeather(false); }, { timeout: 800 });
    } else {
      showMsg(t('weather_loading'));
      setTimeout(() => { if (body.isConnected) fetchWeather(false); }, 200);
    }

    /* ── Responsive scale: shared helper (also used by clock/pomodoro) ── */
    const weatherWidget = body.closest('.widget');
    // natural size of .we-row: icon ~3.2rem + info ~80px wide, total ~130x70px
    if (weatherWidget) {
      attachAutoScale(id, weatherWidget, row, 130, 70, { minScale: 0.6, maxScale: 2.5, padX: 24, padY: 24, headerH: 34 });
    }
  }
});

