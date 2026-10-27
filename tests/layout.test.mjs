import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const code = await readFile(new URL('../js/layout.js', import.meta.url), 'utf8');
// The pure geometry/layout helpers take a geom object, so they need no DOM.
const ctx = vm.createContext({ console });
vm.runInContext(code, ctx);

const GAP = vm.runInContext('GAP', ctx);
const geom = { gw: 1200, vc: 12, colW: 100, rowH: 100 };
const pos = (layout, id) => {
  const p = layout.get(id);
  return p ? { x: p.x, y: p.y, w: p.w, h: p.h } : null;
};

test('dense layout places items in order and wraps by lowest slot', () => {
  const ws = [
    { id: 'a', type: 'link', w: 1, h: 1 },
    { id: 'b', type: 'clock', w: 3, h: 2 },
    { id: 'c', type: 'notes', w: 4, h: 4 },
  ];
  const layout = ctx.computeDenseLayout(ws, geom);
  assert.equal(JSON.stringify(pos(layout, 'a')), JSON.stringify({ x: 0, y: 0, w: 1, h: 100 }));
  const clockW = 3 * 100 + 2 * GAP;
  assert.equal(JSON.stringify(pos(layout, 'b')), JSON.stringify({ x: 1, y: 0, w: 3, h: clockW / 1.5 }));
  assert.equal(JSON.stringify(pos(layout, 'c')), JSON.stringify({ x: 4, y: 0, w: 4, h: 4 * 100 + 3 * GAP }));
});

test('dense layout fills a hole left by a shorter item', () => {
  const tall = { id: 'tall', type: 'notes', w: 1, h: 3 };
  const a = { id: 'a', type: 'link', w: 1, h: 1 };
  const b = { id: 'b', type: 'link', w: 1, h: 1 };
  const c = { id: 'c', type: 'link', w: 1, h: 1 };
  const filler = { id: 'filler', type: 'link', w: 1, h: 1 };
  // vc=3: tall occupies column 0; a/b fill the top of columns 1/2. The
  // remaining 1-row items go into the lowest free slots above the tall item's
  // bottom (y = 100 + GAP), not below it.
  const layout = ctx.computeDenseLayout([tall, a, b, c, filler], { ...geom, vc: 3 });
  assert.equal(pos(layout, 'tall').x, 0);
  assert.equal(pos(layout, 'tall').y, 0);
  assert.equal(pos(layout, 'a').x, 1);
  assert.equal(pos(layout, 'b').x, 2);
  assert.equal(pos(layout, 'c').y, 100 + GAP);
  assert.equal(pos(layout, 'filler').y, 100 + GAP);
});

test('aspect-locked widgets derive pixel height from width', () => {
  const ws = [
    { id: 'clock', type: 'clock', w: 3, h: 2 },
    { id: 'pom', type: 'pomodoro', w: 3, h: 3 },
  ];
  const layout = ctx.computeDenseLayout(ws, geom);
  const clockW = 3 * 100 + 2 * GAP;
  assert.equal(pos(layout, 'clock').h, clockW / 1.5);
  assert.equal(pos(layout, 'pom').h, clockW);
});

test('layout is deterministic across width changes and back', () => {
  const ws = [
    { id: 'a', type: 'link', w: 1, h: 1 },
    { id: 'b', type: 'clock', w: 3, h: 2 },
    { id: 'c', type: 'todo', w: 5, h: 5 },
    { id: 'd', type: 'notes', w: 4, h: 4 },
  ];
  const wide1 = ctx.computeDenseLayout(ws, geom);
  const narrow = ctx.computeDenseLayout(ws, { ...geom, vc: 6 });
  const wide2 = ctx.computeDenseLayout(ws, geom);
  assert.notEqual(JSON.stringify([...narrow]), JSON.stringify([...wide1]));
  assert.equal(JSON.stringify([...wide2]), JSON.stringify([...wide1]));
  const reordered = ctx.computeDenseLayout([ws[1], ws[0], ...ws.slice(2)], geom);
  assert.equal(pos(reordered, 'b').x, 0);
  assert.equal(pos(reordered, 'a').x, 3);
});

test('clampSize enforces per-type min/max and visible columns', () => {
  const w = { type: 'clock', w: 99, h: 99 };
  ctx.clampSize(w, 12);
  assert.equal(w.w, 6);
  assert.equal(w.h, 4);
  const link = { type: 'link', w: 0, h: 0 };
  ctx.clampSize(link, 12);
  assert.equal(link.w, 1);
  assert.equal(link.h, 1);
});

test('wPx converts a dense slot to pixels', () => {
  const link = ctx.wPx({ type: 'link' }, { x: 1, y: 200, w: 1, h: 100 }, geom);
  assert.deepEqual({ ...link }, { left: 100 + GAP, top: 200, width: 100, height: 100 });
  const clock = ctx.wPx({ type: 'clock' }, { x: 0, y: 0, w: 3, h: 248 }, geom);
  assert.equal(clock.width, 3 * 100 + 2 * GAP);
  assert.equal(clock.height, 248);
});
