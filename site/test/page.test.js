// run: node --test site/test/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Page = require('../page.js');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const lcg = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

test('a failed or empty data file gives no clone numbers', () => {
  for (const m of [null, undefined, {}, { clones: {} }, { clones: { lifetime: 'x', last14d: 3 } }, { clones: { lifetime: 5 } }, { clones: { lifetime: -1, last14d: 2 } }, { clones: { lifetime: 1.5, last14d: 2 } }]) {
    assert.strictEqual(Page.clonesOf(m), null);
  }
  assert.deepStrictEqual(Page.clonesOf({ clones: { lifetime: 2853, last14d: 527 } }), { life: 2853, last14d: 527 });
  assert.deepStrictEqual(Page.clonesOf({ clones: { lifetime: 0, last14d: 0 } }), { life: 0, last14d: 0 });
});

test('the page holds no sample numbers to fall back on', () => {
  assert.doesNotMatch(read('site.js'), /FALLBACK|1200|\b168\b/);
});

test('the cross-repository total is labelled as globally tracked clones', () => {
  assert.strictEqual(Page.totalLabel({ totalCounted: { clones: 18304, repos: 8 } }), 'Globally tracked clones');
  assert.strictEqual(Page.totalLabel({}), null);
  assert.strictEqual(Page.totalLabel({ totalCounted: { repos: 0 } }), null);
  assert.match(read('index.html'), /id="liTotal"/);
  assert.doesNotMatch(read('index.html'), /Tracked globally|Counted across all repos/);
});


test('every number in the footer starts hidden and empty, so a failed fetch leaves none', () => {
  const html = read('index.html');
  const items = (html.match(/<li [^\n]*<\/li>/g) || []).filter((li) => li.includes('data-k='));
  assert.ok(items.length >= 7, 'found ' + items.length + ' footer items');
  for (const li of items) {
    assert.match(li, /^<li[^>]*\bhidden\b/, li.slice(0, 60));
    assert.match(li, /data-k="[^"]+"[^>]*><\/b>/, 'a number is baked in: ' + li.slice(-40));
  }
});

test('the 14 daily values always add up to the real 14-day figure', () => {
  for (const total of [0, 1, 5, 13, 14, 168, 312, 527, 4000]) {
    const w = Page.windowFrom(total, lcg(11));
    assert.strictEqual(w.length, 14);
    assert.strictEqual(w.reduce((a, b) => a + b, 0), total);
    assert.ok(w.every((n) => n >= 0));
  }
});

test('the first paint shows the poster machine with no number on it, and the canvas hides it once on', () => {
  const html = read('index.html'), css = read('style.css'), js = read('site.js');
  const fb = html.slice(html.indexOf('id="fb"'), html.indexOf('</main>'));
  assert.match(fb, /fbplaque/);
  assert.match(fb, /id="fbwin"/);
  assert.doesNotMatch(fb, /<span>\d<\/span>|id="fbw"[^>]*>\d/);
  assert.doesNotMatch(css, /(^|\n)\.fb\{display:none\}/);
  assert.match(css, /\.glon \.fb\{display:none\}/);
  assert.match(js, /classList\.add\('glon'\)/);
  assert.match(js, /classList\.remove\('glon'\)/);
});

test('the footer says clones include automated traffic', () => {
  assert.match(read('index.html'), /<footer[\s\S]*Clones include automated traffic\.[\s\S]*<\/footer>/);
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
