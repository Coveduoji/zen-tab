'use strict';
const ENGINES = {
  google:     { label:'Google',     url:'https://www.google.com/search?q=',  fav:'https://www.google.com/favicon.ico',     fb:'G' },
  bing:       { label:'Bing',       url:'https://www.bing.com/search?q=',    fav:'https://www.bing.com/favicon.ico',       fb:'B' },
  duckduckgo: { label:'DuckDuckGo', url:'https://duckduckgo.com/?q=',        fav:'https://duckduckgo.com/favicon.ico',     fb:'D' },
  baidu:      { label:'百度',        url:'https://www.baidu.com/s?wd=',       fav:'https://www.baidu.com/favicon.ico',      fb:'百' },
};
const ENG_ORDER = ['google','bing','duckduckgo','baidu'];
var curEng = 'google';
var engSwitcherOpen = false;

function buildEngSwitcher() {
  const sw = document.getElementById('eng-switcher');
  const fragment = document.createDocumentFragment();
  ENG_ORDER.forEach(k => {
    const e   = ENGINES[k];
    const opt = document.createElement('div');
    opt.className = 'eng-opt' + (k === curEng ? ' active' : '');
    opt.dataset.k = k;
    const img = document.createElement('img');
    img.src = e.fav; img.alt = '';
    const fb = document.createElement('span');
    fb.className = 'eng-fb-sm'; fb.style.display = 'none'; fb.textContent = e.fb;
    img.addEventListener('error', () => { img.style.display = 'none'; fb.style.display = 'flex'; });
    const lbl = document.createTextNode(' ' + e.label + ' ');
    const chk = document.createElement('span');
    chk.className = 'eng-opt-check'; chk.textContent = '✓';
    opt.append(img, fb, lbl, chk);
    opt.addEventListener('click', ev => {
      ev.stopPropagation(); setEng(k); closeEngSwitcher();
      toast(t('engine_switched', e.label), '');
    });
    fragment.appendChild(opt);
  });
  const hint = document.createElement('div');
  hint.className = 'eng-switcher-hint';
  hint.textContent = lang === 'zh' ? 'Tab 快速切换' : 'Tab to cycle';
  fragment.appendChild(hint);
  sw.innerHTML = ''; sw.appendChild(fragment);
}

function openEngSwitcher()  { engSwitcherOpen = true;  buildEngSwitcher(); document.getElementById('eng-switcher').classList.add('open'); }
function closeEngSwitcher() { engSwitcherOpen = false; document.getElementById('eng-switcher').classList.remove('open'); }

function setEng(k) {
  curEng = k; state.settings.engine = k; saveState();
  const eng = ENGINES[k];
  const img = document.getElementById('eng-img');
  const fb  = document.getElementById('eng-fb');
  if (img && fb) {
    img.src = eng.fav; img.style.display = 'block'; fb.style.display = 'none';
    img.removeEventListener('error', img._engErrHandler);
    img._engErrHandler = () => { img.style.display = 'none'; fb.style.display = 'block'; fb.textContent = eng.fb; };
    img.addEventListener('error', img._engErrHandler);
  }
  document.getElementById('eng-badge').title = `${eng.label} — ${lang==='zh'?'点击切换':'click to switch'}`;
}

function initSearch() {
  curEng = state.settings.engine || 'google';
  setEng(curEng);

  document.getElementById('eng-badge').addEventListener('click', e => {
    e.stopPropagation();
    engSwitcherOpen ? closeEngSwitcher() : openEngSwitcher();
  });
  document.addEventListener('click', () => { if (engSwitcherOpen) closeEngSwitcher(); });

  document.getElementById('search-input').addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      setEng(ENG_ORDER[(ENG_ORDER.indexOf(curEng)+1) % ENG_ORDER.length]);
      toast(t('engine_switched', ENGINES[curEng].label), '');
    } else if (e.key === 'Enter') {
      const q = e.target.value.trim();
      if (q) window.open(ENGINES[curEng].url + encodeURIComponent(q), '_self');
    }
  });

  document.getElementById('search-go').addEventListener('click', () => {
    const q = document.getElementById('search-input').value.trim();
    if (q) window.open(ENGINES[curEng].url + encodeURIComponent(q), '_self');
  });
}
