// run: node --test site/test/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Page = require('../page.js');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the page holds no sample numbers to fall back on', () => {
  assert.doesNotMatch(read('site.js'), /FALLBACK|1200|\b168\b/);
});

test('the cross-repository total reads Globally tracked clones and the repository count reads Used in', () => {
  assert.strictEqual(Page.totalLabel({ totalCounted: { clones: 18304, repos: 8 } }), 'Globally tracked clones');
  assert.strictEqual(Page.totalLabel({}), null);
  assert.strictEqual(Page.totalLabel({ totalCounted: { repos: 0 } }), null);
  const html = read('index.html');
  assert.match(html, /id="liTotal"/);
  assert.match(html, /<li id="liRepos"[^\n]*<span class="key">Used in<\/span>/);
  assert.match(html, /<span class="key">Globally tracked clones<\/span>/);
  assert.doesNotMatch(html, /owner's own|automated traffic/i);
});


test('every number in the footer starts hidden and empty, so a failed fetch leaves none', () => {
  const html = read('index.html');
  const items = (html.match(/<li [^\n]*<\/li>/g) || []).filter((li) => li.includes('data-k='));
  assert.ok(items.length >= 5, 'found ' + items.length + ' footer items');
  for (const li of items) {
    assert.match(li, /^<li[^>]*\bhidden\b/, li.slice(0, 60));
    assert.match(li, /data-k="[^"]+"[^>]*><\/b>/, 'a number is baked in: ' + li.slice(-40));
  }
});

test('the machine runs on made-up numbers: a base that grows with the clock, then each ball adds its own value', () => {
  const t0 = Date.UTC(2026, 10, 4);
  assert.ok(Page.machineCount(t0 + 3600e3) > Page.machineCount(t0));
  assert.ok(Page.machineCount(t0) < 9999999);
  const a = Page.series(11), b = Page.series(11), xs = Array.from({ length: 30 }, a);
  assert.deepStrictEqual(xs, Array.from({ length: 30 }, b), 'the stream repeats for one seed');
  assert.ok(new Set(xs).size > 5, 'days vary');
  assert.ok(xs.every((v) => Number.isInteger(v) && v >= 1));
  const js = read('site.js');
  assert.doesNotMatch(js, /clonesOf|seedFrom|last14d|metrics\.clones/);
  assert.match(js, /scene\.rollDigits/);
  assert.match(js, /S\.fig = total/);
  assert.match(read('scene.js'), /x\.fillRect\(30 \+ i \* bw/, 'the small screen draws a bar per day');
});

test('the first paint shows one calm loading panel, never a 2D machine, and the canvas fades in over it', () => {
  const html = read('index.html'), css = read('style.css'), js = read('site.js');
  assert.match(html, /id="load"/);
  assert.doesNotMatch(html, /id="fb"|fbwin|poster/);
  assert.doesNotMatch(css, /\.fb|\.cell|\.sepc/);
  assert.match(css, /\.glon \.load\{opacity:0\}/);
  assert.doesNotMatch(js, /buildFallback/);
  assert.match(js, /classList\.add\('glon'\)/);
  assert.match(js, /classList\.remove\('glon'\)/);
});

test('stars and watchers show only from 10 stars, clones always', () => {
  assert.strictEqual(Page.showStars({ stars: 9, watchers: 4 }), false);
  assert.strictEqual(Page.showStars({ stars: 10, watchers: 4 }), true);
  assert.strictEqual(Page.showStars({}), false);
  assert.strictEqual(Page.showStars(null), false);
});

test('the page shows the live badge of this repository, read from its own data file', () => {
  const html = read('index.html');
  const img = html.match(/<img class="badge"[^>]*>/);
  assert.ok(img, 'no badge image');
  assert.match(img[0], /src="https:\/\/img\.shields\.io\/badge\/dynamic\/json\?url=https:\/\/raw\.githubusercontent\.com\/oficiallyAkshay\/clonometer\/badges\/clones\.json&amp;query=\$\.badge/);
  assert.match(img[0], /height="20"/);
  assert.match(html, /<li id="liBadge"><img class="badge"/);
  assert.doesNotMatch(html, /Clones, all time|Clones, last 14 days|id="liClones/i);
});

test('the page has no ledger, no serial plate and no placeholder licence note', () => {
  const html = read('index.html'), js = read('site.js'), css = read('style.css'), scene = read('scene.js');
  assert.doesNotMatch(html.slice(html.indexOf('<body>')), /ledger|Ledger/);
  assert.doesNotMatch(js, /ledger|leaderboard|LICENSE_NAME|placeholder/i);
  assert.doesNotMatch(css, /\.ledger|\.sheet|\.fbplaque|\.fbplinth/);
  assert.doesNotMatch(scene, /CLONOMETER|SERIAL|No\. 0001/);
  assert.throws(() => read('leaderboard.json'), /ENOENT/);
});

test('the main action reads Open source, MIT, free and stays 44 px tall on small screens', () => {
  assert.match(read('index.html'), /<a class="repo"[^>]*aria-label="Open source on GitHub"[\s\S]*?<span>Open source, MIT, free<\/span>/);
  assert.match(read('style.css'), /@media \(max-width:820px\)\{[^@]*\.repo\{min-height:44px\}/);
});

function fakes() {
  const calls = [], canvas = new EventTarget(), doc = new EventTarget();
  doc.hidden = false;
  const scene = { stop: () => calls.push('stop'), start: () => calls.push('start'), restore: () => { calls.push('restore'); return scene.ok; }, ok: true };
  return { calls, canvas, doc, scene };
}
const lose = (canvas) => { const e = new Event('webglcontextlost', { cancelable: true }); canvas.dispatchEvent(e); return e; };

test('a lost graphics context stops the scene timer and keeps the browser from giving up the context', () => {
  const { calls, canvas, doc, scene } = fakes();
  Page.watch(canvas, doc, scene, () => calls.push('fail'));
  const e = lose(canvas);
  assert.ok(e.defaultPrevented);
  assert.deepStrictEqual(calls, ['stop']);
});

test('a restored context rebuilds the scene and resumes the timer', () => {
  const { calls, canvas, doc, scene } = fakes();
  Page.watch(canvas, doc, scene, () => calls.push('fail'));
  lose(canvas);
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  assert.deepStrictEqual(calls, ['stop', 'restore', 'start']);
});

test('showing the tab again does not restart a scene whose context is still lost', () => {
  const { calls, canvas, doc, scene } = fakes();
  Page.watch(canvas, doc, scene, () => calls.push('fail'));
  lose(canvas);
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
  doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
  assert.deepStrictEqual(calls, ['stop', 'stop']);
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  assert.deepStrictEqual(calls, ['stop', 'stop', 'restore', 'start']);
});

test('a context restored while the tab is hidden waits for the tab', () => {
  const { calls, canvas, doc, scene } = fakes();
  Page.watch(canvas, doc, scene, () => {});
  lose(canvas); doc.hidden = true;
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
  assert.deepStrictEqual(calls, ['stop', 'restore', 'start']);
});

test('a scene that cannot be rebuilt falls back and is not started', () => {
  const { calls, canvas, doc, scene } = fakes();
  scene.ok = false;
  Page.watch(canvas, doc, scene, () => calls.push('fail'));
  lose(canvas);
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  assert.deepStrictEqual(calls, ['stop', 'restore', 'fail']);
});
