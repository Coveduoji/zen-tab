/* GitHub trending is shared by every gtrend widget: one request, one cache
   write. One widget being removed must not abort the others' request. */
const TREND_PER_PAGE = 15;
const _gtrendCache = makeLocalCache('gtrend_cache_v2', 10 * 60 * 1000);
let _gtrendPromise = null;

// Symbol-only languages need an explicit alias — stripping non-letters from
// "C++"/"C#" would otherwise collapse both onto the "C" class.
const TREND_LANG_ALIAS = { 'c++': 'cpp', 'c#': 'csharp', 'f#': 'fsharp' };
function _trendLangClass(l) {
  const key = (l || '').toLowerCase();
  return 'lang-' + (TREND_LANG_ALIAS[key] || key.replace(/[^a-z0-9]/g, ''));
}

function _parseTrending(data) {
  return (data.items || []).map(repo => ({
    repoName: repo.full_name,
    link:     repo.html_url,
    stars:    repo.stargazers_count >= 1000
                ? (repo.stargazers_count / 1000).toFixed(1) + 'k'
                : String(repo.stargazers_count),
    language: repo.language || '',
    desc:     (repo.description || '').slice(0, 100),
  }));
}

function _fetchTrendingData() {
  if (_gtrendPromise) return _gtrendPromise;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dateStr = since.toISOString().slice(0, 10); // YYYY-MM-DD
  const url = `https://api.github.com/search/repositories?q=created:>${dateStr}` +
    `&sort=stars&order=desc&per_page=${TREND_PER_PAGE}`;

  const p = fetch(url, {
    // Do NOT send X-GitHub-Api-Version: it is not CORS-safelisted and forces
    // an extra OPTIONS preflight on every request.
    headers: { 'Accept': 'application/vnd.github+json' },
    signal: (() => { try { return AbortSignal.timeout(8000); } catch (_) { return undefined; } })(),
  })
    .then(r => {
      if (r.status === 403) throw new Error('rate_limit');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(data => {
      const items = _parseTrending(data);
      if (!items.length) throw new Error('empty');
      _gtrendCache.save(items);
      return items;
    });

  _gtrendPromise = p;
  const clear = () => { if (_gtrendPromise === p) _gtrendPromise = null; };
  p.then(clear, clear);
  return p;
}

reg({ type:'gtrend', get name(){return t('w_gtrend');}, get desc(){return t('w_gtrend_d');}, icon:'🔥', cat:'info',
  render(body, cfg, id) {

    /* ── Config ── */
    const DEFAULT_SHOW = 5;

    /* ── Build item element ── */
    function makeItem(item, rank) {
      const a = document.createElement('a');
      a.className = 'gt-item';
      a.href = item.link || ('https://github.com/' + item.repoName);
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.addEventListener('click', e => {
        e.stopPropagation();
        const gw = body.closest('.widget');
        if (gw && gw._wasDragged) e.preventDefault();
      });

      const row1 = document.createElement('div'); row1.className = 'gt-row1';
      const rankEl = document.createElement('span'); rankEl.className = 'gt-rank';
      rankEl.textContent = rank + '.';
      const nameEl = document.createElement('span'); nameEl.className = 'gt-name';
      nameEl.textContent = item.repoName;
      const starsEl = document.createElement('span'); starsEl.className = 'gt-stars';
      starsEl.textContent = '★ ' + (item.stars || '—');
      row1.append(rankEl, nameEl, starsEl);
      a.appendChild(row1);

      if (item.desc) {
        const descEl = document.createElement('div'); descEl.className = 'gt-desc';
        descEl.textContent = item.desc;
        a.appendChild(descEl);
      }
      if (item.language) {
        const langEl = document.createElement('div'); langEl.className = 'gt-lang';
        const dot = document.createElement('span');
        dot.className = 'gt-lang-dot ' + _trendLangClass(item.language);
        langEl.append(dot, document.createTextNode(item.language));
        a.appendChild(langEl);
      }
      return a;
    }

    /* ── Shell (built once) ── */
    const shell = document.createElement('div'); shell.className = 'gt-shell';
    const list  = document.createElement('div'); list.className  = 'gt-list';
    const footer = document.createElement('div'); footer.className = 'gt-footer';
    const footerMsg = document.createElement('span'); footerMsg.className = 'gt-footer-msg';
    const moreBtn = document.createElement('button'); moreBtn.className = 'gt-more-btn';
    footer.append(footerMsg, moreBtn);
    shell.append(list, footer);
    body.appendChild(shell);

    let allItems = [];
    let expanded = false;

    function render(items, isStale) {
      allItems = items;
      list.innerHTML = '';
      const show = expanded ? items.length : Math.min(DEFAULT_SHOW, items.length);
      items.slice(0, show).forEach((item, i) => list.appendChild(makeItem(item, i + 1)));

      if (items.length === 0) {
        const msg = document.createElement('div'); msg.className = 'gt-msg';
        msg.textContent = t('gtrend_error'); list.appendChild(msg);
      }

      /* footer timestamp */
      const ts = _gtrendCache.age();
      if (ts) {
        const mins = Math.floor((Date.now() - ts) / 60000);
        footerMsg.textContent = (isStale ? '⚠ ' : '') + t('gtrend_mins_ago', mins);
      } else {
        footerMsg.textContent = '';
      }

      if (items.length > DEFAULT_SHOW) {
        moreBtn.textContent = expanded ? t('gtrend_less') : t('gtrend_more');
        moreBtn.style.display = '';
        moreBtn.onclick = e => { e.stopPropagation(); expanded = !expanded; render(allItems, isStale); };
      } else {
        moreBtn.style.display = 'none';
      }
    }

    function showLoading() {
      list.innerHTML = '<div class="gt-msg">' + t('gtrend_loading') + '</div>';
    }

    function fetchTrending(force) {
      if (!force) {
        const cached = _gtrendCache.load();
        if (cached) { render(cached, false); return; }
      }
      // Offline: use stale cache or show brief message
      if (!navigator.onLine) {
        const stale = _gtrendCache.loadStale();
        if (stale && stale.length > 0) { render(stale, true); return; }
        list.innerHTML = '<div class="gt-msg">⚡ ' + (lang === 'zh' ? '离线' : 'Offline') + '</div>';
        return;
      }
      showLoading();

      _fetchTrendingData()
        .then(items => { if (body.isConnected) render(items, false); })
        .catch(err => {
          if (!body.isConnected) return;
          console.warn('[gtrend] fetch failed:', err);
          const stale = _gtrendCache.loadStale();
          if (stale && stale.length > 0) {
            render(stale, true);
            if (err.message === 'rate_limit') footerMsg.textContent = t('gtrend_rate_cached');
          } else {
            list.innerHTML = '<div class="gt-msg">🔥 ' + t('gtrend_error') + '</div>';
            footerMsg.textContent = err.message === 'rate_limit' ? t('gtrend_rate_limit') : '';
            moreBtn.style.display = 'none';
          }
        });
    }

    /* Refresh on click of footer msg */
    footerMsg.style.cursor = 'pointer';
    footerMsg.title = t('weather_refresh');
    footerMsg.addEventListener('click', e => { e.stopPropagation(); fetchTrending(true); });

    // Cached data paints immediately; the network request waits for idle.
    const initial = _gtrendCache.load();
    if (initial) {
      render(initial, false);
    } else if (!navigator.onLine) {
      fetchTrending(false);
    } else if (window.requestIdleCallback) {
      showLoading();
      requestIdleCallback(() => { if (body.isConnected) fetchTrending(false); }, { timeout: 800 });
    } else {
      showLoading();
      setTimeout(() => { if (body.isConnected) fetchTrending(false); }, 200);
    }
  }
});


