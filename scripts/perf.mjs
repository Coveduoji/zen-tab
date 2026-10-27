import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const rootArg = process.argv.find(a => a.startsWith('--root='));
const htmlArg = process.argv.find(a => a.startsWith('--html='));
const root = rootArg ? path.resolve(rootArg.split('=')[1]) : path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const htmlPath = htmlArg ? htmlArg.split('=')[1] : 'dist/newtab.html';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const rel = decodeURIComponent(url.pathname);
    if (rel === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const file = path.join(root, rel);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const url = `http://127.0.0.1:${port}/${htmlPath}`;

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

// Keep measurements deterministic and offline: only the local fixture server
// is allowed. Weather/gtrend caches are seeded, so nothing should fetch.
await context.route('**/*', route => {
  const u = route.request().url();
  if (u.startsWith(`http://127.0.0.1:${port}`)) route.continue();
  else route.abort();
});

const seed = {
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

function seedScript({ state, bg, weather, trending }) {
  const s = structuredClone(state);
  localStorage.setItem('dash_bg_img', bg);
  localStorage.setItem('dash_v3', JSON.stringify({ version: 3, widgets: s.widgets, settings: s.settings }));
  localStorage.setItem('weather_cache_v2', JSON.stringify({ payload: weather, ts: Date.now() }));
  localStorage.setItem('gtrend_cache_v2', JSON.stringify({ payload: trending, ts: Date.now() }));
}

// 1) Setup page: create a realistic ~3MB JPEG and seed all storage.
{
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
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
  const weather = {
    icon: '☀️', temp: 21, desc: '晴', city: 'Test City',
    daily: Array.from({ length: 7 }, (_, i) => ({ code: 0, hi: 24 + i, lo: 14 + i })),
  };
  const trending = Array.from({ length: 15 }, (_, i) => ({
    repoName: `owner/repo-${i}`, link: `https://github.com/owner/repo-${i}`,
    stars: `${10 - i / 2}k`, language: i % 2 ? 'TypeScript' : 'Rust', desc: 'fixture repository',
  }));
  await page.evaluate(seedScript, { state: seed, bg, weather, trending });
  console.log(`[perf] seeded background ${(bg.length / 1024 / 1024).toFixed(2)} MB (data URL)`);
  await page.close();
}

const results = [];
for (let run = 0; run < 2; run++) {
  const page = await context.newPage();
  await page.addInitScript(() => {
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

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('#grid-canvas .widget', { timeout: 8000 });
  await page.waitForTimeout(1600); // let idle network / entrance animation settle

  const boot = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const mark = performance.getEntriesByName('zt:render:done')[0];
    return {
      firstWidget: window.__ztFirstWidget,
      fcp: fcp ? fcp.startTime : null,
      renderMark: mark ? mark.startTime : null,
      domContentLoaded: nav.domContentLoadedEventEnd ?? null,
      load: nav.loadEventEnd ?? null,
      longTasks: window.__ztLong.length,
      maxLongTask: window.__ztLong.reduce((m, e) => Math.max(m, e.dur), 0),
      writes: window.__ztWrites,
      widgets: document.querySelectorAll('#grid-canvas .widget').length,
      layers: document.querySelectorAll('#grid-canvas .widget').length,
      backdrop: [...document.querySelectorAll('#grid-canvas .widget')]
        .filter(el => getComputedStyle(el).backdropFilter && getComputedStyle(el).backdropFilter !== 'none').length,
    };
  });

  // Notes typing: 20 edits, then wait for the 400ms + 500ms save debounces.
  await page.evaluate(() => { window.__ztWrites = []; });
  const ta = page.locator('.notes-ta').first();
  for (let i = 0; i < 20; i++) await ta.press('End').then(() => ta.type('x'));
  await page.waitForTimeout(1200);
  const typing = await page.evaluate(() => window.__ztWrites);

  // Reorder drag in edit mode: measure rAF frame intervals and layout/recalc work.
  await page.evaluate(() => { const g = document.getElementById('grid-outer'); if (g) g.scrollTop = 0; });
  await page.keyboard.press('Control+e');
  await page.waitForTimeout(250);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const metricsBefore = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const clock = page.locator('#grid-canvas .widget[data-type="clock"]').first();
  const b = await clock.boundingBox();
  const framesPromise = page.evaluate(() => {
    window.__ztFrames = [];
    let last = performance.now();
    return new Promise(resolve => {
      const start = performance.now();
      function frame(t) {
        window.__ztFrames.push(t - last); last = t;
        if (performance.now() - start < 1300) requestAnimationFrame(frame);
        else resolve(window.__ztFrames);
      }
      requestAnimationFrame(frame);
    });
  }).catch(() => null);
  if (b) {
    await page.mouse.move(b.x + b.width / 2, b.y + 10);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 180, b.y + 120, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(400);
  }
  const dragFrames = await framesPromise;
  const metricsAfter = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const dragMetrics = {
    layouts: (metricsAfter.LayoutCount || 0) - (metricsBefore.LayoutCount || 0),
    recalcStyle: (metricsAfter.RecalcStyleCount || 0) - (metricsBefore.RecalcStyleCount || 0),
    layoutMs: +(((metricsAfter.LayoutDuration || 0) - (metricsBefore.LayoutDuration || 0)) * 1000).toFixed(2),
  };
  await page.keyboard.press('Control+e');
  await page.waitForTimeout(100);

  // Theme switch long tasks (the optimized build applies the theme instantly).
  await page.evaluate(() => { window.__ztLong = []; });
  await page.keyboard.press('Control+m');
  await page.waitForTimeout(2600);
  const theme = await page.evaluate(() => ({
    longTasks: window.__ztLong.length,
    maxLongTask: window.__ztLong.reduce((m, e) => Math.max(m, e.dur), 0),
  }));

  results.push({ boot, typing, dragFrames, dragMetrics, theme });
  await page.close();
}

const summarize = arr => {
  if (!arr || !arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const p = q => s[Math.min(s.length - 1, Math.floor(s.length * q))];
  return { n: s.length, p50: +p(0.5).toFixed(1), p95: +p(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1) };
};

const last = results[results.length - 1];
const bigWrites = last.boot.writes.filter(w => w.bytes > 100000);
console.log(JSON.stringify({
  root, htmlPath,
  boot: {
    firstWidget: last.boot.firstWidget,
    fcp: last.boot.fcp,
    renderMark: last.boot.renderMark,
    domContentLoaded: last.boot.domContentLoaded,
    load: last.boot.load,
    widgets: last.boot.widgets,
    backdropFilters: last.boot.backdrop,
    longTasks: last.boot.longTasks,
    maxLongTask: last.boot.maxLongTask,
    binaryWritesOnBoot: bigWrites.map(w => ({ k: w.k, mb: +(w.bytes / 1024 / 1024).toFixed(2), ms: +w.ms.toFixed(2) })),
  },
  typing: {
    writes: last.typing.length,
    bigWrites: last.typing.filter(w => w.bytes > 100000).length,
    maxMs: last.typing.reduce((m, w) => Math.max(m, w.ms), 0),
  },
  drag: { frames: summarize(last.dragFrames), ...last.dragMetrics },
  themeSwitch: last.theme,
  runs: results.map(r => ({ firstWidget: r.boot.firstWidget, fcp: r.boot.fcp, load: r.boot.load, maxLongTask: r.boot.maxLongTask, backdrop: r.boot.backdrop })),
}, null, 2));

await browser.close();
server.close();
