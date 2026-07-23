reg({ type:'gtrend', get name(){return t('w_gtrend');}, get desc(){return t('w_gtrend_d');}, icon:'🔥', cat:'info',
  render(body, cfg, id) {

    /* ── Config ── */
    const DEFAULT_SHOW = 5;
    const PER_PAGE     = 15;

    /* ── P2: use shared cache factory ── */
    const gtrendCache = makeLocalCache('gtrend_cache_v2', 10 * 60 * 1000);

    /* Build API URL: repos created in the last 7 days, sorted by stars descending */
    function buildApiUrl() {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const dateStr = since.toISOString().slice(0, 10); // YYYY-MM-DD
      return `https://api.github.com/search/repositories?q=created:>${dateStr}&sort=stars&order=desc&per_page=${PER_PAGE}`;
    }

    /* ── Language dot colour class ── */
    // Symbol-only languages need an explicit alias — stripping non-letters
    // from "C++"/"C#" would otherwise collapse both onto the "C" class.
    const LANG_ALIAS = { 'c++': 'cpp', 'c#': 'csharp', 'f#': 'fsharp' };
    const langClass = l => {
      const key = (l || '').toLowerCase();
      return 'lang-' + (LANG_ALIAS[key] || key.replace(/[^a-z0-9]/g, ''));
    };

    /* ── GitHub Search API → item array ── */
    function parseApiResponse(data) {
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
        dot.className = 'gt-lang-dot ' + langClass(item.language);
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
      const ts = gtrendCache.age();
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
        const cached = gtrendCache.load();
        if (cached) { render(cached, false); return; }
      }
      // Offline: use stale cache or show brief message
      if (!navigator.onLine) {
        const stale = gtrendCache.loadStale();
        if (stale && stale.length > 0) { render(stale, true); return; }
        list.innerHTML = '<div class="gt-msg">⚡ ' + (lang === 'zh' ? '离线' : 'Offline') + '</div>';
        return;
      }
      showLoading();

      fetch(buildApiUrl(), {
        headers: { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
      })
        .then(r => {
          if (r.status === 403) throw new Error('rate_limit');
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(data => {
          const items = parseApiResponse(data);
          if (items.length > 0) {
            gtrendCache.save(items);
            render(items, false);
          } else {
            throw new Error('empty');
          }
        })
        .catch(err => {
          console.warn('[gtrend] fetch failed:', err);
          const stale = gtrendCache.loadStale();
          if (stale && stale.length > 0) {
            render(stale, true);
            if (err.message === 'rate_limit') {
            footerMsg.textContent = t('gtrend_rate_cached');
            }
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

    fetchTrending(false);
  }
});


