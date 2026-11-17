import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const CSP = manifest.content_security_policy.extension_pages;
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
    const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' };
    // Exercise the exact MV3 extension_pages policy on a normal page where
    // headless Chrome can run it (theme-init.js + app.js must both load).
    if (url.pathname === '/dist/newtab.html' && url.searchParams.has('csp')) {
      headers['Content-Security-Policy'] = CSP;
    }
    res.writeHead(200, headers);
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) errors.push('console: ' + msg.text()); });

await page.goto(`http://127.0.0.1:${port}/dist/newtab.html`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid-canvas .widget', { timeout: 5000 });

const base = await page.evaluate(() => ({
  widgets: document.querySelectorAll('#grid-canvas .widget').length,
  theme: document.documentElement.getAttribute('data-theme'),
  hasLink: !!document.querySelector('.link-widget-body'),
  renderMark: performance.getEntriesByName('zt:render:done').length,
  saved: !!localStorage.getItem('dash_v3'),
  hint: localStorage.getItem('dash_theme'),
  font: getComputedStyle(document.documentElement).getPropertyValue('--body').trim().slice(0, 20),
  normalModeDeleteButtons: [...document.querySelectorAll('.w-delete')]
    .filter(el => getComputedStyle(el).display !== 'none').length,
  normalModeResizeHandles: [...document.querySelectorAll('.ui-resizable-se')]
    .filter(el => getComputedStyle(el).display !== 'none').length,
  normalInertBodies: document.querySelectorAll('.w-body[inert]').length,
}));
console.log('base', base);
await page.focus('#search-input');
await page.waitForTimeout(250);
console.log('search focus', await page.evaluate(() => {
  const el = document.getElementById('search-inner');
  const s = getComputedStyle(el);
  return { theme: document.documentElement.getAttribute('data-theme'), color: s.color, border: s.borderColor, shadow: s.boxShadow };
}));
await page.evaluate(() => document.getElementById('search-input').blur());

// Link keyboard activation (the anchor is queried inside the detached body).
await page.evaluate(() => { window.__opened = []; window.open = (...args) => { window.__opened.push(args[0]); }; });
await page.locator('.link-widget-body').first().focus();
await page.keyboard.press('Enter');
console.log('link keyboard opens', await page.evaluate(() => window.__opened.length));

// Long-press ring: a quick click on blank canvas must show no ring; the ring
// only appears after a deliberate hold (~200ms), and edit mode needs ~700ms.
const blank = await page.evaluate(() => {
  const canvas = document.getElementById('grid-canvas');
  const r = canvas.getBoundingClientRect();
  for (let y = r.top + 100; y < Math.min(r.bottom, innerHeight) - 20; y += 40) {
    for (let x = r.left + 40; x < r.right - 40; x += 80) {
      const el = document.elementFromPoint(x, y);
      if (el && !el.closest('.widget') && canvas.contains(el)) return { x, y };
    }
  }
  return { x: r.left + 40, y: r.top + 100 };
});
await page.mouse.click(blank.x, blank.y);
await page.waitForTimeout(60);
console.log('ring after quick click', await page.evaluate(() => getComputedStyle(document.getElementById('lp-ring')).display));
await page.mouse.move(blank.x, blank.y);
await page.mouse.down();
await page.waitForTimeout(300);
console.log('ring after 300ms hold', await page.evaluate(() => getComputedStyle(document.getElementById('lp-ring')).display));
await page.mouse.up();
console.log('edit after 300ms hold', await page.evaluate(() => document.body.classList.contains('edit-mode')));
await page.mouse.down();
await page.waitForTimeout(800);
console.log('edit after 800ms hold', await page.evaluate(() => document.body.classList.contains('edit-mode')));
await page.mouse.up();
if (await page.evaluate(() => document.body.classList.contains('edit-mode'))) await page.keyboard.press('Control+e');

// Command palette
await page.keyboard.press('Control+k');
console.log('cmd open', await page.locator('#cmd-overlay.open').count());
await page.keyboard.press('Escape');

// Add every non-link widget via the marketplace
for (const type of ['clock', 'notes', 'todo', 'weather', 'gtrend', 'pomodoro']) {
  await page.keyboard.press('Control+a');
  await page.locator(`.mkt-item[data-t="${type}"] .mkt-add`).click();
  await page.waitForTimeout(250);
}
console.log('after add', await page.evaluate(() => ({
  widgets: document.querySelectorAll('#grid-canvas .widget').length,
  renderErrors: [...document.querySelectorAll('#grid-canvas .widget')].filter(el => el.textContent.includes('Render error')).length,
})));

// Notes persistence
const notes = page.locator('.notes-ta').first();
if (await notes.count()) {
  await notes.fill('smoke-note');
  await notes.blur();
  await page.waitForTimeout(600);
}

// Pomodoro start/pause
const pom = page.locator('.pom-start-btn').first();
if (await pom.count()) {
  await pom.click();
  await page.waitForTimeout(1100);
  await pom.click();
}

// Reorder in NORMAL mode (no edit mode): drag the clock onto the notes
// widget. Only the array order should change; dense masonry recomputes the
// positions and fills gaps.
// Earliest widgets may be scrolled out of view after typing in notes.
await page.evaluate(() => { const g = document.getElementById('grid-outer'); if (g) g.scrollTop = 0; });
await page.waitForTimeout(120);
const clock = page.locator('#grid-canvas .grid-stack-item[data-type="clock"]').first();
const notesWidget = page.locator('#grid-canvas .grid-stack-item[data-type="notes"]').first();
const clockBefore = await clock.evaluate(el => ({ x: el.gridstackNode?.x, y: el.gridstackNode?.y, w: el.gridstackNode?.w, h: el.gridstackNode?.h }));
const cb = await clock.boundingBox();
const nb = await notesWidget.boundingBox();
console.log('drag points', { cb, nb, hit: await page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y);
  return el ? { tag: el.tagName, cls: String(el.className), widget: el.closest('.widget')?.dataset.type || null } : null;
}, { x: cb ? cb.x + cb.width / 2 : 0, y: cb ? cb.y + 30 : 0 }) });
if (cb && nb) {
  await page.mouse.move(cb.x + cb.width / 2, cb.y + 30);
  await page.mouse.down();
  await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2, { steps: 15 });
  console.log('during reorder', await page.evaluate(() => ({
    edit: document.body.classList.contains('edit-mode'),
    dragging: document.querySelector('.grid-stack-item.ui-draggable-dragging')?.dataset.type || null,
    placeholder: !!document.querySelector('.grid-stack-placeholder'),
  })));
  await page.mouse.up();
  await page.waitForTimeout(500);
}
const reorder = await page.evaluate(() => {
  const items = [...document.querySelectorAll('#grid-canvas > .grid-stack-item')].map(el => ({
    type: el.dataset.type,
    x: el.gridstackNode?.x ?? 0,
    y: el.gridstackNode?.y ?? 0,
  }));
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  return items.map(x => x.type);
});
console.log('reorder', { clockBefore, clockAfter: await clock.evaluate(el => ({ x: el.gridstackNode?.x, y: el.gridstackNode?.y, w: el.gridstackNode?.w, h: el.gridstackNode?.h })), visualOrder: reorder });

// Theme cycle via View Transition: the new theme snapshot replaces the old.
const before = await page.getAttribute('html', 'data-theme');
await page.keyboard.press('Control+m');
await page.waitForTimeout(60);
const switched = await page.getAttribute('html', 'data-theme');
await page.keyboard.press('Control+k');
console.log('theme transition', {
  before, switched,
  cmdDuringTransition: await page.locator('#cmd-overlay.open').count(),
  vtOrigin: await page.evaluate(() => document.documentElement.style.getPropertyValue('--vt-ox') || ''),
});
await page.keyboard.press('Escape');
await page.waitForTimeout(1300);
const after = await page.getAttribute('html', 'data-theme');
console.log('theme final', after);

// Edit mode
await page.keyboard.press('Control+e');
await page.waitForTimeout(300);
console.log('edit mode', await page.evaluate(() => ({
  body: document.body.classList.contains('edit-mode'),
  grid: document.getElementById('grid-bg').classList.contains('visible'),
  cells: document.querySelectorAll('#grid-bg .grid-bg-cell').length,
  deleteButtons: [...document.querySelectorAll('.w-delete')]
    .filter(el => getComputedStyle(el).display !== 'none').length,
  resizeHandles: [...document.querySelectorAll('.ui-resizable-se')]
    .filter(el => getComputedStyle(el).display !== 'none').length,
  inertBodies: document.querySelectorAll('.w-body[inert]').length,
  inertHeaders: document.querySelectorAll('.w-header[inert]').length,
})));

// Dragging must still work in edit mode even though the card content is inert.
await page.evaluate(() => { const g = document.getElementById('grid-outer'); if (g) g.scrollTop = 0; });
await page.waitForTimeout(120);
const editClock = page.locator('#grid-canvas > .grid-stack-item[data-type="clock"]').first();
const editBefore = await editClock.evaluate(el => ({ x: el.gridstackNode?.x, y: el.gridstackNode?.y }));
const eb = await editClock.boundingBox();
if (eb) {
  await page.mouse.move(eb.x + eb.width / 2, eb.y + 30);
  await page.mouse.down();
  await page.mouse.move(eb.x + eb.width / 2 + 90, eb.y + 30, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(350);
}
console.log('edit drag', { before: editBefore, after: await editClock.evaluate(el => ({ x: el.gridstackNode?.x, y: el.gridstackNode?.y })) });

// Resize via the bottom-right handle (grid-snapped), then exit edit mode.
const resizeWidget = page.locator('#grid-canvas > .grid-stack-item[data-type="clock"]').first();
const beforeResize = await resizeWidget.evaluate(el => ({ w: el.gridstackNode?.w, h: el.gridstackNode?.h }));
const resizeHandle = resizeWidget.locator('.ui-resizable-se');
const rb = await resizeHandle.boundingBox();
if (rb) {
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await page.mouse.down();
  await page.mouse.move(rb.x + 110, rb.y + 90, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(450);
}
console.log('resize', { before: beforeResize, after: await resizeWidget.evaluate(el => ({ w: el.gridstackNode?.w, h: el.gridstackNode?.h })) });
await page.keyboard.press('Control+e');

// Pure mode
await page.keyboard.press('Control+p');
await page.waitForTimeout(400);
console.log('pure mode', await page.evaluate(() => ({
  body: document.body.classList.contains('pure-mode'),
  hidden: document.querySelectorAll('#grid-canvas .widget.pure-hidden').length,
})));
await page.keyboard.press('Control+p');
await page.waitForTimeout(100);
console.log('pure exit', await page.evaluate(() => document.querySelectorAll('#grid-canvas .widget.pure-hidden').length));

// Settings panel
await page.evaluate(() => document.getElementById('fab-settings').click());
await page.waitForTimeout(200);
console.log('settings', await page.locator('#settings-body .theme-card').count());
const linksBefore = await page.locator('#grid-canvas .widget[data-type="link"]').count();
const totalBefore = await page.locator('#grid-canvas .widget').count();
await page.fill('#s-bulk-links', 'Alpha,https://example.com\nhttps://example.org\nDocs,github.com');
await page.click('#s-bulk-add');
await page.waitForTimeout(600);
const linksAfter = await page.locator('#grid-canvas .widget[data-type="link"]').count();
const totalAfter = await page.locator('#grid-canvas .widget').count();
console.log('bulk links', { linksBefore, linksAfter, totalBefore, totalAfter });
await page.evaluate(() => document.getElementById('settings-close').click());

// Resize the viewport and restore it: every widget must return to exactly
// the same slot (the core reason for switching to order-only layout).
const layoutBefore = await page.evaluate(() => Object.fromEntries(
  [...document.querySelectorAll('#grid-canvas > .grid-stack-item')].map(el => [el.dataset.id, JSON.stringify({ x: el.gridstackNode?.x, y: el.gridstackNode?.y, w: el.gridstackNode?.w, h: el.gridstackNode?.h })]),
));
await page.setViewportSize({ width: 900, height: 850 });
await page.waitForTimeout(450);
const narrowed = await page.evaluate(() => ({
  widgets: document.querySelectorAll('#grid-canvas .widget').length,
  minHeight: document.getElementById('grid-canvas').style.minHeight,
}));
await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(450);
const layoutAfter = await page.evaluate(() => Object.fromEntries(
  [...document.querySelectorAll('#grid-canvas > .grid-stack-item')].map(el => [el.dataset.id, JSON.stringify({ x: el.gridstackNode?.x, y: el.gridstackNode?.y, w: el.gridstackNode?.w, h: el.gridstackNode?.h })]),
));
console.log('after resize', {
  ...narrowed,
  restored: JSON.stringify(layoutBefore) === JSON.stringify(layoutAfter),
  before: layoutBefore,
  after: layoutAfter,
});

// Reload and confirm persistence
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid-canvas .widget', { timeout: 5000 });
await page.waitForTimeout(450);
console.log('after reload', await page.evaluate(() => {
  const els = [...document.querySelectorAll('#grid-canvas .widget')];
  const rects = els.map(el => ({ type: el.dataset.type, r: el.getBoundingClientRect() }));
  const overlaps = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i].r, b = rects[j].r;
      if (a.left < b.right - 1 && b.left < a.right - 1 &&
          a.top < b.bottom - 1 && b.top < a.bottom - 1) {
        overlaps.push([rects[i].type, rects[j].type]);
      }
    }
  }
  const clock = document.querySelector('#grid-canvas > .grid-stack-item[data-type="clock"]');
  return {
    widgets: els.length,
    theme: document.documentElement.getAttribute('data-theme'),
    note: document.querySelector('.notes-ta')?.value || null,
    clockNode: clock ? JSON.stringify({ x: clock.gridstackNode?.x, y: clock.gridstackNode?.y, w: clock.gridstackNode?.w, h: clock.gridstackNode?.h }) : null,
    renderErrors: els.filter(el => el.textContent.includes('Render error')).length,
    overlaps,
  };
}));

// Edit-mode delete button: visible in edit mode, opens confirm, removes.
await page.keyboard.press('Control+e');
await page.waitForTimeout(250);
const deleteButtons = await page.locator('#grid-canvas .w-delete:visible').count();
const beforeDelete = await page.locator('#grid-canvas .widget').count();
await page.locator('#grid-canvas .w-delete').last().click({ force: true });
await page.waitForTimeout(100);
await page.locator('#cb-ok').click();
await page.waitForTimeout(350);
const afterDelete = await page.locator('#grid-canvas .widget').count();
await page.keyboard.press('Control+e');
console.log('delete button', { visible: deleteButtons, beforeDelete, afterDelete });

// Verify the external theme-init script against the real manifest CSP.
const cspErrors = [];
const cspPage = await context.newPage();
cspPage.on('pageerror', e => cspErrors.push('pageerror: ' + e.message));
cspPage.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) cspErrors.push('console: ' + msg.text()); });
await cspPage.goto(`http://127.0.0.1:${port}/dist/newtab.html?csp=1`, { waitUntil: 'domcontentloaded' });
await cspPage.evaluate(() => localStorage.setItem('dash_theme', JSON.stringify({ theme: 'light', hue: 'lavender', hasBg: false })));
await cspPage.reload({ waitUntil: 'domcontentloaded' });
await cspPage.waitForTimeout(300);
console.log('csp theme-init', await cspPage.evaluate(() => ({
  theme: document.documentElement.getAttribute('data-theme'),
  colorScheme: document.documentElement.style.colorScheme,
  widgets: document.querySelectorAll('#grid-canvas .widget').length,
})), cspErrors);
errors.push(...cspErrors);

// Backward compatibility: old free-position data is sorted once into the
// user's current reading order, then saved with orderOnly:true and no x/y.
const migCtx = await browser.newContext();
const migPage = await migCtx.newPage();
await migPage.addInitScript(() => {
  localStorage.setItem('dash_v3', JSON.stringify({
    version: 3,
    widgets: [
      { id: 'late', type: 'notes', x: 5, y: 5, w: 4, h: 4, config: { content: 'late' } },
      { id: 'early', type: 'clock', x: 0, y: 0, w: 3, h: 2, config: {} },
    ],
    settings: { theme: 'monet', monetHue: 'lavender', engine: 'google', lang: 'zh', background: { type: 'default', value: '', overlay: 0, blur: 0, brightness: 1 } },
  }));
});
await migPage.goto(`http://127.0.0.1:${port}/dist/newtab.html`, { waitUntil: 'domcontentloaded' });
await migPage.waitForSelector('#grid-canvas .widget', { timeout: 5000 });
await migPage.waitForTimeout(300);
console.log('order migration', await migPage.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('dash_v3'));
  return { order: s.widgets.map(w => w.id), orderOnly: s.orderOnly, hasXY: s.widgets.some(w => 'x' in w || 'y' in w) };
}));
await migCtx.close();

// Large background upload: it must survive a refresh even when the data URL
// is near/over the localStorage quota.
const bgCtx = await browser.newContext();
const bgPage = await bgCtx.newPage();
await bgPage.goto(`http://127.0.0.1:${port}/dist/newtab.html`, { waitUntil: 'domcontentloaded' });
await bgPage.waitForSelector('#grid-canvas .widget', { timeout: 5000 });
const bgBlobSize = await bgPage.evaluate(async () => {
  const c = document.createElement('canvas');
  c.width = 5200; c.height = 4000;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 5200, 4000);
  g.addColorStop(0, '#102030'); g.addColorStop(1, '#a04020');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 5200, 4000);
  for (let i = 0; i < 90000; i++) {
    ctx.fillStyle = `hsla(${(i * 53) % 360},80%,60%,.45)`;
    ctx.fillRect((i * 733) % 5200, (i * 977) % 4000, 16, 16);
  }
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
  const file = new File([blob], 'bg.jpg', { type: 'image/jpeg' });
  const dt = new DataTransfer(); dt.items.add(file);
  const input = document.getElementById('bg-file-input');
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return blob.size;
});
await bgPage.waitForTimeout(1500);
const bgNow = await bgPage.evaluate(async () => ({
  idb: ((await window.idbKeyval.get('zen_bg')) || '').length,
  legacy: (localStorage.getItem('dash_bg_img') || '').length,
  placeholder: JSON.parse(localStorage.getItem('dash_v3') || '{}').settings?.background?.value,
  layer: (document.getElementById('bg-layer').style.backgroundImage || '').length,
}));
await bgPage.reload({ waitUntil: 'domcontentloaded' });
// The image is applied asynchronously once IndexedDB resolves.
await bgPage.waitForFunction(
  () => (document.getElementById('bg-layer').style.backgroundImage || '').length > 1000,
  null,
  { timeout: 5000 },
).catch(() => {});
const bgAfter = await bgPage.evaluate(async () => ({
  idb: ((await window.idbKeyval.get('zen_bg')) || '').length,
  layer: (document.getElementById('bg-layer').style.backgroundImage || '').length,
}));
console.log('background persistence', { blobBytes: bgBlobSize, now: bgNow, afterReload: bgAfter });
if (!(bgNow.idb > 1000000 && bgNow.placeholder === '__dash_bg_img__' && bgNow.legacy === 0 && bgNow.layer > 1000)) {
  errors.push('background not stored in IndexedDB with a dash_v3 placeholder');
}
if (!(bgAfter.idb === bgNow.idb && bgAfter.layer > 1000)) {
  errors.push('background did not survive reload');
}
await bgCtx.close();

// Custom link icons are downscaled at upload and stored as WebP, keeping the
// shared localStorage quota small (photos are ~10x smaller than PNG).
{
  const iconCtx = await browser.newContext();
  const iconPage = await iconCtx.newPage();
  iconPage.on('pageerror', e => errors.push('icon pageerror: ' + e.message));
  await iconPage.goto(`http://127.0.0.1:${port}/dist/newtab.html`, { waitUntil: 'domcontentloaded' });
  await iconPage.waitForSelector('#grid-canvas .widget', { timeout: 5000 });
  await iconPage.evaluate(() => document.getElementById('fab-add').click());
  await iconPage.locator('.mkt-item[data-t="link"] .mkt-add').click();
  await iconPage.waitForSelector('#link-modal.open', { timeout: 5000 });
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
  await iconPage.locator('#lm-img-file').setInputFiles({ name: 'icon.png', mimeType: 'image/png', buffer: png });
  await iconPage.waitForTimeout(400);
  await iconPage.fill('#link-name', 'IconSmoke');
  await iconPage.fill('#link-url', 'example.net');
  await iconPage.locator('#link-save').click();
  await iconPage.waitForTimeout(400);
  const icon = await iconPage.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('dash_v3') || '{}');
    const w = (s.widgets || []).find(w => w.type === 'link' && w.config?.name === 'IconSmoke');
    const raw = w ? localStorage.getItem('dash_limg_' + w.id) : null;
    return {
      placeholder: w?.config?.customImg || null,
      webp: !!raw && raw.startsWith('data:image/webp'),
      chars: raw ? raw.length : 0,
      rendered: !!document.querySelector(`.widget[data-id="${w?.id}"] .lw-custom-img`),
    };
  });
  console.log('custom link icon', icon);
  if (!(icon.placeholder === '__dash_limg__' && icon.webp && icon.rendered)) {
    errors.push('custom link icon was not stored as WebP');
  }
  await iconCtx.close();
}

// Phone-style folders: create, rename, add existing links + a new one, open
// from the dashboard, persist, move one out, then delete and release the rest.
{
  const folderCtx = await browser.newContext();
  const folderPage = await folderCtx.newPage();
  folderPage.on('pageerror', e => errors.push('folder pageerror: ' + e.message));
  folderPage.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
      errors.push('folder console: ' + msg.text());
    }
  });
  await folderPage.goto(`http://127.0.0.1:${port}/dist/newtab.html`, { waitUntil: 'domcontentloaded' });
  await folderPage.waitForSelector('#grid-canvas .widget', { timeout: 5000 });

  // Three unfiled links; one more (wl1) comes from the default state.
  await folderPage.evaluate(() => document.getElementById('fab-settings').click());
  await folderPage.waitForTimeout(250);
  await folderPage.locator('#s-bulk-links').fill('Alpha,https://alpha.example\nBeta,https://beta.example\nDelta,https://delta.example');
  await folderPage.evaluate(() => document.getElementById('s-bulk-add').click());
  await folderPage.waitForTimeout(300);
  await folderPage.evaluate(() => document.getElementById('settings-close').click());
  await folderPage.evaluate(() => document.activeElement?.blur());

  // Create a folder from the marketplace; it opens straight into edit mode.
  await folderPage.evaluate(() => document.getElementById('fab-add').click());
  await folderPage.waitForTimeout(250);
  await folderPage.locator('.mkt-item[data-t="folder"] .mkt-add').click();
  await folderPage.waitForTimeout(300);
  const folderOpen = await folderPage.evaluate(() => ({
    open: document.getElementById('folder-modal').classList.contains('open'),
    editing: !document.getElementById('folder-name').readOnly,
  }));

  await folderPage.locator('#folder-name').fill('Work');
  await folderPage.locator('#folder-name').press('Enter');
  await folderPage.waitForTimeout(200);

  // Add two existing dashboard links through the picker, then a brand-new one.
  await folderPage.evaluate(() => document.getElementById('folder-add-existing').click());
  await folderPage.waitForTimeout(150);
  await folderPage.locator('#folder-pick-list .fp-row', { hasText: 'Alpha' }).locator('input').check();
  await folderPage.locator('#folder-pick-list .fp-row', { hasText: 'Beta' }).locator('input').check();
  await folderPage.evaluate(() => document.getElementById('folder-pick-add').click());
  await folderPage.waitForTimeout(300);
  await folderPage.evaluate(() => document.getElementById('folder-add-new').click());
  await folderPage.waitForTimeout(250);
  await folderPage.locator('#link-name').fill('Gamma');
  await folderPage.locator('#link-url').fill('gamma.example');
  await folderPage.evaluate(() => document.getElementById('link-save').click());
  await folderPage.waitForTimeout(300);

  const folderStyle = await folderPage.evaluate(() => {
    const el = document.querySelector('.widget[data-type="folder"] .fw-fav');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { backdrop: cs.backdropFilter || cs.webkitBackdropFilter, bg: cs.backgroundColor };
  });
  const folderState = await folderPage.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('dash_v3') || '{}');
    const f = (s.widgets || []).find(w => w.type === 'folder');
    const byId = new Map((s.widgets || []).filter(w => w.type === 'link').map(w => [w.id, w.config.name]));
    return {
      name: f?.config?.name,
      kids: f ? f.config.childIds.length : -1,
      kidNames: f ? f.config.childIds.map(id => byId.get(id)) : [],
      gridLinks: document.querySelectorAll('#grid-canvas .widget[data-type="link"]').length,
      previewCells: [...document.querySelectorAll('.widget[data-type="folder"] .fw-cell')]
        .filter(c => c.textContent.trim() || c.querySelector('img')).length,
    };
  });

  // In-folder drag reorder: move the first icon after the last one.
  const folderReorder = await folderPage.evaluate(() => {
    const grid = document.getElementById('folder-grid');
    const items = [...grid.querySelectorAll('.folder-item')];
    const first = items[0], last = items[items.length - 1];
    const dt = new DataTransfer();
    const r = last.getBoundingClientRect();
    first.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    last.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.right - 2, clientY: r.top + r.height / 2 }));
    first.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const s = JSON.parse(localStorage.getItem('dash_v3') || '{}');
    const f = (s.widgets || []).find(w => w.type === 'folder');
    const byId = new Map((s.widgets || []).filter(w => w.type === 'link').map(w => [w.id, w.config.name]));
    return {
      kids: f.config.childIds.map(id => byId.get(id)),
      dom: [...grid.querySelectorAll('.folder-item .fi-name')].map(e => e.textContent),
    };
  });

  await folderPage.evaluate(() => {
    document.getElementById('folder-done').click();
    document.getElementById('folder-close').click();
  });
  await folderPage.waitForTimeout(250);

  // Normal-mode click opens the folder; a child launches and closes it.
  await folderPage.evaluate(() => {
    window.__opened = [];
    window.open = (...a) => { window.__opened.push(a[0]); return null; };
  });
  await folderPage.locator('.widget[data-type="folder"]').click();
  await folderPage.waitForTimeout(250);
  const normalOpen = await folderPage.evaluate(() => ({
    open: document.getElementById('folder-modal').classList.contains('open'),
    readonly: document.getElementById('folder-name').readOnly,
    items: document.querySelectorAll('#folder-grid .folder-item').length,
  }));
  await folderPage.locator('#folder-grid .folder-item', { hasText: 'Alpha' }).click();
  await folderPage.waitForTimeout(200);
  const launched = await folderPage.evaluate(() => ({
    opened: window.__opened.slice(),
    open: document.getElementById('folder-modal').classList.contains('open'),
  }));

  // Reload: folder and filed links persist; filed links stay off the grid.
  await folderPage.reload({ waitUntil: 'domcontentloaded' });
  await folderPage.waitForSelector('#grid-canvas .widget', { timeout: 5000 });
  await folderPage.waitForTimeout(300);
  const persisted = await folderPage.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('dash_v3') || '{}');
    const f = (s.widgets || []).find(w => w.type === 'folder');
    const filed = (s.widgets || []).filter(w => w.type === 'link' && f?.config.childIds.includes(w.id));
    return {
      folder: !!f,
      kids: f ? f.config.childIds.length : 0,
      tile: !!document.querySelector('.widget[data-type="folder"]'),
      filedHidden: filed.every(w => !document.querySelector(`.grid-stack-item[data-id="${w.id}"]`)),
    };
  });

  // Move one child back out, then delete the folder (remaining links return).
  await folderPage.locator('.widget[data-type="folder"]').click();
  await folderPage.waitForTimeout(200);
  await folderPage.evaluate(() => document.getElementById('folder-edit').click());
  await folderPage.waitForTimeout(150);
  await folderPage.locator('#folder-grid .fi-del').first().click();
  await folderPage.waitForTimeout(300);
  const moved = await folderPage.evaluate(() => ({
    kids: JSON.parse(localStorage.getItem('dash_v3')).widgets.find(w => w.type === 'folder').config.childIds.length,
    gridLinks: document.querySelectorAll('#grid-canvas .widget[data-type="link"]').length,
  }));
  await folderPage.evaluate(() => document.getElementById('folder-del').click());
  await folderPage.waitForTimeout(150);
  await folderPage.evaluate(() => document.getElementById('cb-ok').click());
  await folderPage.waitForTimeout(400);
  const deleted = await folderPage.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('dash_v3') || '{}');
    return {
      folders: s.widgets.filter(w => w.type === 'folder').length,
      links: s.widgets.filter(w => w.type === 'link').length,
      gridLinks: document.querySelectorAll('#grid-canvas .widget[data-type="link"]').length,
    };
  });

  console.log('folder', { folderOpen, folderStyle, folderState, folderReorder, normalOpen, launched, persisted, moved, deleted });
  if (!folderOpen.open || !folderOpen.editing) errors.push('folder editor did not open');
  if (!(folderReorder.kids.join(',') === 'Beta,Gamma,Alpha' &&
        folderReorder.dom.join(',') === 'Beta,Gamma,Alpha')) {
    errors.push('in-folder drag reorder failed');
  }
  if (!folderStyle || !String(folderStyle.backdrop).includes('blur')) {
    errors.push('folder tile is not frosted glass');
  }
  if (!(folderState.name === 'Work' && folderState.kids === 3 &&
        folderState.kidNames.join(',') === 'Alpha,Beta,Gamma' &&
        folderState.gridLinks === 2 && folderState.previewCells === 3)) {
    errors.push('folder children were not stored/rendered correctly');
  }
  if (!normalOpen.open || !normalOpen.readonly || normalOpen.items !== 3) errors.push('folder did not open in normal mode');
  if (!launched.opened.includes('https://alpha.example') || launched.open) errors.push('folder child did not launch/close');
  if (!(persisted.folder && persisted.kids === 3 && persisted.tile && persisted.filedHidden)) {
    errors.push('folder did not persist across reload');
  }
  if (!(moved.kids === 2 && moved.gridLinks === 3)) errors.push('moving a link out of a folder failed');
  if (!(deleted.folders === 0 && deleted.gridLinks === deleted.links)) errors.push('deleting a folder did not release its links');
  await folderCtx.close();
}

// Show Labels: link/folder names appear under the icons and the setting
// survives a reload.
{
  const labelCtx = await browser.newContext();
  const labelPage = await labelCtx.newPage();
  labelPage.on('pageerror', e => errors.push('labels pageerror: ' + e.message));
  labelPage.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
      errors.push('labels console: ' + msg.text());
    }
  });
  await labelPage.goto(`http://127.0.0.1:${port}/dist/newtab.html`, { waitUntil: 'domcontentloaded' });
  await labelPage.waitForSelector('#grid-canvas .widget', { timeout: 5000 });
  await labelPage.evaluate(() => document.getElementById('fab-settings').click());
  await labelPage.waitForTimeout(300);
  await labelPage.evaluate(() => {
    const el = document.getElementById('s-labels');
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await labelPage.waitForTimeout(200);
  const labelsOn = await labelPage.evaluate(() => ({
    saved: JSON.parse(localStorage.getItem('dash_v3') || '{}').settings?.showLabels,
    body: document.body.classList.contains('show-labels'),
    linkLabel: getComputedStyle(document.querySelector('.lw-name')).display,
  }));
  await labelPage.evaluate(() => document.getElementById('settings-close').click());
  await labelPage.reload({ waitUntil: 'domcontentloaded' });
  await labelPage.waitForSelector('#grid-canvas .widget', { timeout: 5000 });
  await labelPage.waitForTimeout(300);
  const labelsPersist = await labelPage.evaluate(() => ({
    body: document.body.classList.contains('show-labels'),
    linkLabel: getComputedStyle(document.querySelector('.lw-name')).display,
  }));
  console.log('labels', { labelsOn, labelsPersist });
  if (!(labelsOn.saved === true && labelsOn.body && labelsOn.linkLabel === 'block' &&
        labelsPersist.body && labelsPersist.linkLabel === 'block')) {
    errors.push('show-labels setting did not apply/persist');
  }
  await labelCtx.close();
}

// Every 4 grid rows gets a separator, positioned on the real grid pitch.
{
  const rowCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const rowPage = await rowCtx.newPage();
  rowPage.on('pageerror', e => errors.push('rows pageerror: ' + e.message));
  await rowPage.goto(`http://127.0.0.1:${port}/dist/newtab.html`, { waitUntil: 'domcontentloaded' });
  await rowPage.waitForSelector('#grid-canvas .widget', { timeout: 5000 });
  await rowPage.evaluate(() => document.getElementById('fab-settings').click());
  await rowPage.waitForTimeout(250);
  const many = Array.from({ length: 40 }, (_, i) => `R${i},https://r${i}.example`).join('\n');
  await rowPage.locator('#s-bulk-links').fill(many);
  await rowPage.evaluate(() => document.getElementById('s-bulk-add').click());
  await rowPage.waitForTimeout(600);
  await rowPage.evaluate(() => document.getElementById('settings-close').click());
  await rowPage.waitForTimeout(400);
  await rowPage.waitForFunction(() => document.querySelectorAll('.row-divider').length > 0, null, { timeout: 5000 }).catch(() => {});
  const rows = await rowPage.evaluate(() => {
    const canvas = document.getElementById('grid-canvas');
    const cols = parseInt((canvas.className.match(/gs-(\d+)/) || [])[1] || '0', 10);
    const pitch = cols ? canvas.getBoundingClientRect().width / cols : 0;
    return {
      widgets: document.querySelectorAll('#grid-canvas .widget').length,
      dividers: [...document.querySelectorAll('#row-dividers .row-divider')].map(e => parseFloat(e.style.top)),
      pitch,
    };
  });
  console.log('row dividers', rows);
  const dividersOk = rows.dividers.length >= 1 && rows.pitch > 0 &&
    rows.dividers.every((top, i) => Math.abs(top - (i + 1) * 4 * rows.pitch) < 2);
  if (!dividersOk) errors.push('4-row dividers are missing or misaligned');
  await rowCtx.close();
}

// Divider components: add horizontal + vertical overlays from the marketplace,
// shorten the horizontal via its endpoint handle, and confirm the config
// survives a reload. Overlay dividers must never become grid items.
{
  const divCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const divPage = await divCtx.newPage();
  divPage.on('pageerror', e => errors.push('divider pageerror: ' + e.message));
  divPage.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
      errors.push('divider console: ' + msg.text());
    }
  });
  await divPage.goto(`http://127.0.0.1:${port}/dist/newtab.html`, { waitUntil: 'domcontentloaded' });
  await divPage.waitForSelector('#grid-canvas .widget', { timeout: 5000 });
  for (const t of ['divider_h', 'divider_v']) {
    await divPage.evaluate(() => document.getElementById('fab-add').click());
    await divPage.waitForTimeout(250);
    await divPage.locator(`.mkt-item[data-t="${t}"] .mkt-add`).click();
    await divPage.waitForTimeout(450);
  }
  const made = await divPage.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('dash_v3') || '{}');
    const divs = (s.widgets || []).filter(w => w.type === 'divider_h' || w.type === 'divider_v');
    return {
      entries: divs.length,
      types: divs.map(w => w.type),
      gridTypes: [...document.querySelectorAll('#grid-canvas .grid-stack-item')].map(e => e.dataset.type),
      lines: document.querySelectorAll('#divider-layer .divider-line').length,
      corners: document.querySelectorAll('#divider-layer .divider-corner').length,
      handles: document.querySelectorAll('#divider-layer .divider-svg-handle').length,
      removes: document.querySelectorAll('#divider-layer .divider-svg-remove').length,
      edit: document.body.classList.contains('edit-mode'),
    };
  });

  const before = await divPage.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('dash_v3') || '{}');
    return (s.widgets || []).find(w => w.type === 'divider_h')?.config || null;
  });
  const hb = await divPage.evaluate(() => {
    const hs = [...document.querySelectorAll('#divider-layer .divider-svg-handle[data-orient="h"]')];
    if (!hs.length) return null;
    hs.sort((a, b) => Number(a.getAttribute('cx')) - Number(b.getAttribute('cx')));
    const el = hs[hs.length - 1];
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const pitch = await divPage.evaluate(() => {
    const c = document.getElementById('grid-canvas');
    const cols = parseInt((c.className.match(/gs-(\d+)/) || [])[1] || '8', 10);
    return c.getBoundingClientRect().width / cols;
  });
  let resized = null;
  if (hb && pitch > 0) {
    await divPage.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await divPage.mouse.down();
    await divPage.mouse.move(hb.x + hb.width / 2 - pitch, hb.y + hb.height / 2, { steps: 10 });
    await divPage.mouse.up();
    await divPage.waitForTimeout(700);
    resized = await divPage.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('dash_v3') || '{}');
      return (s.widgets || []).find(w => w.type === 'divider_h')?.config || null;
    });
  }

  await divPage.reload({ waitUntil: 'domcontentloaded' });
  await divPage.waitForSelector('#grid-canvas .widget', { timeout: 5000 });
  await divPage.waitForTimeout(500);
  const reloaded = await divPage.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('dash_v3') || '{}');
    const divs = (s.widgets || []).filter(w => w.type === 'divider_h' || w.type === 'divider_v');
    return {
      entries: divs.length,
      h: (s.widgets || []).find(w => w.type === 'divider_h')?.config || null,
      lines: document.querySelectorAll('#divider-layer .divider-line').length,
      gridDivs: document.querySelectorAll('#grid-canvas .grid-stack-item[data-type^="divider"]').length,
    };
  });

  console.log('dividers', { made, before, resized, reloaded });
  if (!(made.entries === 2 && made.types.includes('divider_h') && made.types.includes('divider_v') &&
        !made.gridTypes.some(t => String(t).startsWith('divider')) &&
        made.lines === 2 && made.corners >= 1 && made.handles === 4 && made.removes === 2 && made.edit)) {
    errors.push('overlay dividers were not added/connected/rendered correctly');
  }
  if (!(before && resized && Number.isFinite(before.x2) && resized.x2 === before.x2 - 1 &&
        resized.x1 === before.x1 && resized.y1 === before.y1)) {
    errors.push('divider endpoint resize failed');
  }
  if (!(reloaded.entries === 2 && reloaded.gridDivs === 0 && reloaded.lines === 2 &&
        reloaded.h && resized && reloaded.h.x2 === resized.x2 && reloaded.h.x1 === resized.x1)) {
    errors.push('divider config did not persist across reload');
  }
  await divCtx.close();
}

console.log('errors', errors.length ? errors : 'none');
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
