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

await page.goto(`http://127.0.0.1:${port}/dist/newtab.html`, { waitUntil: 'load' });
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
await page.reload({ waitUntil: 'load' });
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
await cspPage.goto(`http://127.0.0.1:${port}/dist/newtab.html?csp=1`, { waitUntil: 'load' });
await cspPage.evaluate(() => localStorage.setItem('dash_theme', JSON.stringify({ theme: 'light', hue: 'lavender', hasBg: false })));
await cspPage.reload({ waitUntil: 'load' });
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
await migPage.goto(`http://127.0.0.1:${port}/dist/newtab.html`, { waitUntil: 'load' });
await migPage.waitForSelector('#grid-canvas .widget', { timeout: 5000 });
await migPage.waitForTimeout(300);
console.log('order migration', await migPage.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('dash_v3'));
  return { order: s.widgets.map(w => w.id), orderOnly: s.orderOnly, hasXY: s.widgets.some(w => 'x' in w || 'y' in w) };
}));
await migCtx.close();

console.log('errors', errors.length ? errors : 'none');
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
