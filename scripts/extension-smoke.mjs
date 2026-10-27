import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const extArg = process.argv.find(a => a.startsWith('--ext='));
const ext = extArg
  ? path.resolve(extArg.slice('--ext='.length))
  : path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'zen-ext-'));

// Unpacked extension IDs are the first 16 bytes of SHA-256(absolute path),
// encoded as a-p. This lets us open the page directly when chrome://newtab
// is still the browser's own page (headless does not always apply overrides).
const extId = crypto.createHash('sha256').update(ext).digest('hex')
  .slice(0, 32).split('').map(x => String.fromCharCode(97 + parseInt(x, 16))).join('');

const context = await chromium.launchPersistentContext(userDataDir, {
  // Google Chrome refuses --load-extension in headless mode; Playwright's
  // Chromium (new headless via channel: 'chromium') supports it.
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 900 },
  // Playwright adds --disable-extensions by default; remove it so the
  // --load-extension flags below actually take effect.
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [
    `--disable-extensions-except=${ext}`,
    `--load-extension=${ext}`,
    '--no-sandbox',
  ],
});

const errors = [];
const page = context.pages()[0] || await context.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });

// Discover the actual ID / load state from chrome://extensions (shadow DOM).
const extPage = await context.newPage();
await extPage.goto('chrome://extensions/');
await extPage.waitForTimeout(800);
const listed = await extPage.evaluate(() => {
  const mgr = document.querySelector('extensions-manager');
  const list = mgr?.shadowRoot?.querySelector('extensions-item-list');
  const host = list?.shadowRoot || list;
  return [...(host?.querySelectorAll('extensions-item') || [])].map(item => ({
    id: item.id,
    name: item.shadowRoot?.querySelector('#name')?.textContent?.trim() || '',
    errors: !!item.shadowRoot?.querySelector('#errors-button'),
  }));
});
console.log('extensions page', listed);
const found = listed.find(x => x.name.includes('Zen Tab'));
const actualId = found?.id || extId;

const directUrl = `chrome-extension://${actualId}/dist/newtab.html`;
try {
  await page.goto(directUrl, { timeout: 8000 });
} catch (e) {
  console.error('could not open extension page:', e.message);
  await context.close();
  process.exit(2);
}
await page.waitForTimeout(1200);

const first = await page.evaluate(() => ({
  url: location.href,
  widgets: document.querySelectorAll('#grid-canvas .widget').length,
  theme: document.documentElement.getAttribute('data-theme'),
  colorScheme: document.documentElement.style.colorScheme,
}));
console.log('extension page', first);

// Set a light theme hint and reload: only the inline (pre-CSS) script sets
// colorScheme, so a non-empty value proves the CSP hash was accepted.
await page.evaluate(() => {
  localStorage.setItem('dash_theme', JSON.stringify({ theme: 'light', hue: 'lavender', hasBg: false }));
  localStorage.setItem('dash_v3', JSON.stringify({
    version: 3,
    widgets: [{ id: 'wl1', type: 'link', x: 0, y: 0, w: 1, h: 1, config: { name: 'zen-tab', url: 'https://github.com/Coveduoji/zen-tab' } }],
    settings: { theme: 'light', monetHue: 'lavender', engine: 'google', lang: 'zh', compactMode: true, background: { type: 'default', value: '', overlay: 0, blur: 0, brightness: 1 } },
  }));
});
await page.reload();
await page.waitForTimeout(800);

const after = await page.evaluate(() => ({
  theme: document.documentElement.getAttribute('data-theme'),
  colorScheme: document.documentElement.style.colorScheme,
  widgets: document.querySelectorAll('#grid-canvas .widget').length,
}));
console.log('after light hint', after);

// Confirm the manifest's chrome_url_overrides wiring.
const ntp = await context.newPage();
await ntp.goto('chrome://newtab/');
await ntp.waitForTimeout(700);
console.log('newtab override', await ntp.evaluate(() => ({
  url: location.href,
  widgets: document.querySelectorAll('#grid-canvas .widget').length,
  theme: document.documentElement.getAttribute('data-theme'),
})));
console.log('errors', errors.length ? errors : 'none');

await context.close();
process.exit(errors.some(e => e.includes('Content Security Policy')) ? 1 : 0);
