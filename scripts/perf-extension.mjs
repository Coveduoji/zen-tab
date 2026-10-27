import path from 'node:path';
import os from 'node:os';
import { mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ext = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'zen-perf-ext-'));

const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1440, height: 1000 },
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--no-sandbox'],
});

// Keep external requests out of the measurement; seeded caches mean the
// dashboard itself should not need the network.
await context.route('**/*', route => {
  const u = route.request().url();
  if (u.startsWith('chrome-extension://')) route.continue();
  else route.abort();
});

const extPage = await context.newPage();
await extPage.goto('chrome://extensions/');
await extPage.waitForTimeout(600);
const listed = await extPage.evaluate(() => {
  const mgr = document.querySelector('extensions-manager');
  const list = mgr?.shadowRoot?.querySelector('extensions-item-list');
  const host = list?.shadowRoot || list;
  return [...(host?.querySelectorAll('extensions-item') || [])].map(item => ({
    id: item.id,
    name: item.shadowRoot?.querySelector('#name')?.textContent?.trim() || '',
  }));
});
const found = listed.find(x => x.name.includes('Zen Tab'));
if (!found) {
  console.error('extension did not load', listed);
  await context.close();
  process.exit(2);
}
await extPage.close();
const url = `chrome-extension://${found.id}/dist/newtab.html`;
console.log('[perf:ext] extension', found.id);

const page = await context.newPage();
await page.goto(url, { waitUntil: 'load' });

// Seed 8 widgets + a ~1MB background, exactly like scripts/perf.mjs.
const bg = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 3000; c.height = 2000;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 3000, 2000);
  g.addColorStop(0, '#1a1a2e'); g.addColorStop(0.5, '#16213e'); g.addColorStop(1, '#0f3460');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 3000, 2000);
  for (let i = 0; i < 30000; i++) {
    ctx.fillStyle = `hsla(${(i * 37) % 360},70%,60%,0.35)`;
    ctx.fillRect((i * 733) % 3000, (i * 977) % 2000, 12, 12);
  }
  return c.toDataURL('image/jpeg', 0.86);
});
const state = {
  widgets: [
    { id:'wclock', type:'clock', x:0, y:0, w:3, h:2, config:{} },
    { id:'wlink1', type:'link', x:3, y:0, w:1, h:1, config:{ name:'Example', url:'https://example.com', emoji:'🌐' } },
    { id:'wlink2', type:'link', x:4, y:0, w:1, h:1, config:{ name:'Docs', url:'https://example.org', emoji:'📚' } },
    { id:'wnotes', type:'notes', x:6, y:0, w:4, h:4, config:{ content:'performance fixture' } },
    { id:'wtodo', type:'todo', x:10, y:0, w:5, h:5, config:{} },
    { id:'wweather', type:'weather', x:0, y:2, w:3, h:2, config:{} },
    { id:'wgtrend', type:'gtrend', x:4, y:2, w:4, h:5, config:{} },
    { id:'wpom', type:'pomodoro', x:10, y:5, w:3, h:3, config:{} },
  ],
  settings: {
    theme: 'monet', monetHue: 'lavender', engine: 'google', lang: 'zh', compactMode: true,
    background: { type:'image', value:'__dash_bg_img__', overlay:0, blur:0, brightness:1 },
  },
};
const weather = { icon:'☀️', temp:21, desc:'晴', city:'Test City', daily:Array.from({length:7},(_,i)=>({code:0,hi:24+i,lo:14+i})) };
const trending = Array.from({length:15},(_,i)=>({ repoName:`owner/repo-${i}`, link:`https://github.com/owner/repo-${i}`, stars:`${10-i/2}k`, language:i%2?'TypeScript':'Rust', desc:'fixture repository' }));
await page.close();
await context.addInitScript(({ state, bg, weather, trending }) => {
  localStorage.setItem('dash_bg_img', bg);
  localStorage.setItem('dash_v3', JSON.stringify({ version: 3, widgets: state.widgets, settings: state.settings }));
  localStorage.setItem('weather_cache_v2', JSON.stringify({ payload: weather, ts: Date.now() }));
  localStorage.setItem('gtrend_cache_v2', JSON.stringify({ payload: trending, ts: Date.now() }));
}, { state, bg, weather, trending });

const measure = async () => {
  const p = await context.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', msg => {
    // The harness aborts external requests on purpose; ignore those failures.
    if (msg.type() === 'error' && !msg.text().includes('ERR_FAILED')) errors.push('console: ' + msg.text());
  });
  await p.addInitScript(() => {
    window.__ztLong = [];
    window.__ztFirstWidget = null;
    window.__ztWrites = [];
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) window.__ztLong.push({ start: e.startTime, dur: e.duration });
    }).observe({ type: 'longtask', buffered: true });
    new MutationObserver(() => {
      if (!window.__ztFirstWidget && document.querySelector('#grid-canvas .widget')) {
        window.__ztFirstWidget = performance.now();
      }
    }).observe(document, { childList: true, subtree: true });
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      const t0 = performance.now();
      const r = orig.call(this, k, v);
      window.__ztWrites.push({ k, bytes: String(v).length, ms: performance.now() - t0 });
      return r;
    };
  });
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForSelector('#grid-canvas .widget', { timeout: 8000 });
  await p.waitForTimeout(1500);
  const m = await p.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const mark = performance.getEntriesByName('zt:render:done')[0];
    return {
      firstWidget: window.__ztFirstWidget,
      fcp: fcp ? fcp.startTime : null,
      renderMark: mark ? mark.startTime : null,
      dcl: nav.domContentLoadedEventEnd ?? null,
      load: nav.loadEventEnd ?? null,
      longTasks: window.__ztLong.length,
      maxLongTask: window.__ztLong.reduce((a, e) => Math.max(a, e.dur), 0),
      bigWrites: window.__ztWrites.filter(w => w.bytes > 100000).map(w => w.k),
      widgets: document.querySelectorAll('#grid-canvas .widget').length,
      theme: document.documentElement.getAttribute('data-theme'),
      hasCustomBg: document.body.classList.contains('has-custom-bg'),
      bgImageLength: (document.getElementById('bg-layer').style.backgroundImage || '').length,
    };
  });
  m.errors = errors;
  await p.close();
  return m;
};

const runs = [await measure(), await measure()];
console.log('[perf:ext] background', (bg.length / 1024 / 1024).toFixed(2), 'MB');
console.log(JSON.stringify(runs, null, 2));

await context.close();
