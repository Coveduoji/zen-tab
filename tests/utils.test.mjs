import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const code = await readFile(new URL('../js/utils.js', import.meta.url), 'utf8');
const store = new Map();
const ctx = vm.createContext({
  crypto: globalThis.crypto,
  URL,
  console,
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  },
});
vm.runInContext(code, ctx);

test('esc escapes HTML special characters', () => {
  assert.equal(ctx.esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
});

test('normalizeUrl adds https and blocks dangerous protocols', () => {
  assert.equal(ctx.normalizeUrl('github.com'), 'https://github.com');
  assert.equal(ctx.normalizeUrl('//example.com'), 'https://example.com');
  assert.equal(ctx.normalizeUrl('http://example.com'), 'http://example.com');
  assert.equal(ctx.normalizeUrl('javascript:alert(1)'), 'https://');
  assert.equal(ctx.normalizeUrl('data:text/html,x'), 'https://');
  assert.equal(ctx.normalizeUrl(''), '');
});

test('linkEmoji resolves known hosts and subdomains', () => {
  assert.equal(ctx.linkEmoji('github.com'), '🐙');
  assert.equal(ctx.linkEmoji('gist.github.com'), '🐙');
  assert.equal(ctx.linkEmoji('example.com'), '🔗');
  assert.equal(ctx.linkEmoji(''), '🔗');
});

test('genId uses a prefix and a short uuid', () => {
  const id = ctx.genId('clock');
  assert.match(id, /^clock_[0-9a-f]{8}$/);
});

test('debounce coalesces rapid calls', async () => {
  let calls = 0;
  const fn = ctx.debounce(() => calls++, 20);
  fn(); fn(); fn();
  await new Promise(r => setTimeout(r, 50));
  assert.equal(calls, 1);
});

test('makeLocalCache honours ttl and stale fallback', async () => {
  const cache = ctx.makeLocalCache('test_cache', 30);
  cache.save({ hello: 'world' });
  assert.equal(JSON.stringify(cache.load()), JSON.stringify({ hello: 'world' }));
  assert.equal(JSON.stringify(cache.loadStale()), JSON.stringify({ hello: 'world' }));
  await new Promise(r => setTimeout(r, 50));
  assert.equal(cache.load(), null);
  assert.equal(JSON.stringify(cache.loadStale()), JSON.stringify({ hello: 'world' }));
});
