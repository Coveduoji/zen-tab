import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = path.join(root, 'dist');
const htmlPath = path.join(root, 'newtab.html');
const cssPath = path.join(root, 'style.css');

const START = '<!-- build:scripts:start -->';
const END = '<!-- build:scripts:end -->';
const TARGET = 'chrome110';

function readOrderedScripts(html) {
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`build markers missing from newtab.html (${START} / ${END})`);
  }
  const block = html.slice(start + START.length, end);
  const srcs = [...block.matchAll(/<script\s+src="([^"]+)"\s*><\/script>/g)].map(m => m[1]);
  if (!srcs.length) throw new Error('no scripts found between build markers');
  return { start, end, srcs };
}

function kb(text) {
  return (Buffer.byteLength(text) / 1024).toFixed(1) + ' KB';
}

async function build() {
  const html = await readFile(htmlPath, 'utf8');
  const { start, end, srcs } = readOrderedScripts(html);

  const parts = [];
  for (const src of srcs) {
    if (!src.startsWith('js/')) throw new Error(`unexpected script path: ${src}`);
    const file = path.join(root, src);
    if (!existsSync(file)) throw new Error(`missing script: ${src}`);
    parts.push(`/* ${src} */\n${await readFile(file, 'utf8')}`);
  }

  // Classic scripts share one global lexical environment in the browser; an IIFE
  // around the concatenation reproduces that while keeping the global object clean.
  const source = `(() => {\n'use strict';\n${parts.join('\n;\n')}\n})();\n`;
  const js = await esbuild.transform(source, {
    loader: 'js', minify: true, target: TARGET, legalComments: 'none',
  });

  const css = await esbuild.transform(await readFile(cssPath, 'utf8'), {
    loader: 'css', minify: true, target: TARGET, legalComments: 'none',
  });

  await rm(dist, { recursive: true, force: true });
  await mkdir(path.join(dist, 'js'), { recursive: true });
  await mkdir(path.join(dist, 'icons'), { recursive: true });
  await mkdir(path.join(dist, 'vendor'), { recursive: true });

  const gridstackDist = path.join(root, 'node_modules', 'gridstack', 'dist');
  await cp(path.join(gridstackDist, 'gridstack-all.js'), path.join(dist, 'vendor', 'gridstack-all.js'));
  await cp(path.join(gridstackDist, 'gridstack.min.css'), path.join(dist, 'vendor', 'gridstack.min.css'));
  await cp(path.join(root, 'node_modules', 'idb-keyval', 'dist', 'umd.js'), path.join(dist, 'vendor', 'idb-keyval.umd.js'));

  await writeFile(path.join(dist, 'js', 'app.js'), js.code);
  await writeFile(path.join(dist, 'js', 'theme-init.js'), await readFile(path.join(root, 'js', 'theme-init.js'), 'utf8'));
  await writeFile(path.join(dist, 'style.css'), css.code);

  const replacement = `${START}\n<script src="js/app.js"></script>\n${END}`;
  const outHtml = html.slice(0, start) + replacement + html.slice(end + END.length);
  await writeFile(path.join(dist, 'newtab.html'), outHtml);

  const iconsDir = path.join(root, 'icons');
  for (const name of await readdir(iconsDir)) {
    if (!name.endsWith('.png')) continue;
    await cp(path.join(iconsDir, name), path.join(dist, 'icons', name));
  }

  console.log(`[build] ${srcs.length} scripts -> dist/js/app.js (${kb(js.code)})`);
  console.log(`[build] style.css -> dist/style.css (${kb(css.code)})`);
  console.log('[build] dist/newtab.html + dist/js/theme-init.js + dist/icons');
}

const watchMode = process.argv.includes('--watch');
await build();

if (watchMode) {
  let timer = null;
  console.log('[build] watching for changes…');
  watch(root, { recursive: true }, (_event, file) => {
    if (!file) return;
    if (file.startsWith('dist') || file.startsWith('node_modules') || file.startsWith('.git')) return;
    clearTimeout(timer);
    timer = setTimeout(() => build().catch(err => console.error('[build]', err)), 120);
  });
}
