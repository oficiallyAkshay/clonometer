// run: node --test site/test/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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

// runs site.js against a minimal page and returns the footer list items by their data-k key
async function footerFor(metrics) {
  const lis = {}, els = {};
  const make = (key) => {
    const el = {
      hidden: false, textContent: '', href: '', innerHTML: '', offsetHeight: 50, style: { setProperty() { } },
      classList: { add() { } }, addEventListener() { }, focus() { }, closest: () => lis[key] || el
    };
    return el;
  };
  const pick = (sel) => {
    const k = /data-k="(\w+)"/.exec(sel);
    if (k) { lis[k[1]] = lis[k[1]] || { hidden: false }; return els[sel] = els[sel] || make(k[1]); }
    return els[sel] = els[sel] || make(sel);
  };
  const sandbox = {
    document: { querySelector: pick, querySelectorAll: () => [], documentElement: pick('html'), hidden: false, addEventListener() { } },
    location: { search: '' }, matchMedia: () => ({ matches: false }),
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(metrics) }),
    performance: { now: () => 0 }, setInterval() { }, setTimeout() { }, addEventListener() { },
    requestAnimationFrame() { }, console: { warn() { } }, Promise
  };
  sandbox.window = sandbox;
  sandbox.Scene = { create() { throw new Error('no webgl in this test'); } };
  vm.runInNewContext(read('page.js'), sandbox);
  vm.runInNewContext(read('site.js'), sandbox);
  await new Promise((r) => setImmediate(r));
  return lis;
}

const base = { forks: 0, clones: { lifetime: 2853, last14d: 527 }, totalCounted: { clones: 18304, repos: 8 } };

test('the footer hides stars and watchers below 10 stars and keeps the clone counts', async () => {
  const lis = await footerFor(Object.assign({ stars: 9, watchers: 4 }, base));
  assert.strictEqual(lis.stars.hidden, true, 'stars show below 10 stars');
  assert.strictEqual(lis.watchers.hidden, true, 'watchers show below 10 stars');
  assert.strictEqual(lis.clonesLife.hidden, false);
  assert.strictEqual(lis.clones14.hidden, false);
});

test('the footer shows stars and watchers from 10 stars', async () => {
  const lis = await footerFor(Object.assign({ stars: 10, watchers: 4 }, base));
  assert.strictEqual(lis.stars.hidden, false);
  assert.strictEqual(lis.watchers.hidden, false);
});

test('the page carries the live clone badge of this repository, read from the counter service numbers file', () => {
  const html = read('index.html');
  const m = /<img[^>]*src="(https:\/\/img\.shields\.io\/badge\/dynamic\/json\?[^"]*)"/.exec(html);
  assert.ok(m, 'no shields badge image on the page');
  assert.ok(m[1].includes('url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json'), 'badge does not read this repository clones file');
  assert.ok(m[1].includes('query=$.badge'), 'badge is not the week and all-time shape');
});

test('the ledger, its hatch and its data file are gone', () => {
  assert.ok(!/ledger/i.test(read('index.html')), 'ledger markup remains');
  assert.ok(!/ledger|hatch|leaderboard/i.test(read('site.js')), 'ledger code remains');
  assert.ok(!/ledger|\.sheet/.test(read('style.css')), 'ledger styles remain');
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'leaderboard.json')), 'leaderboard.json remains');
});

test('the machine carries one lowercase wordmark and no serial plate, plinth card or repeated number', () => {
  const src = read('scene.js');
  assert.ok(!/CLONOMETER/.test(src), 'an uppercase CLONOMETER stamp remains');
  assert.ok(!/No\. 0001|ACC\. NO|SERIAL/.test(src), 'a serial or accession number remains');
  assert.strictEqual((src.match(/text\('clonometer'/g) || []).length, 1, 'the wordmark is not drawn exactly once on the face');
  assert.ok(!/drawPlaque|tPlq|uHatch/.test(src), 'the plinth card or hatch remains');
});

test('the repository button reads Open source, MIT, free and is at least 44 px high on every screen', () => {
  assert.ok(read('index.html').includes('Open source, MIT, free'));
  assert.ok(!/placeholder/i.test(read('site.js')), 'the licence placeholder note remains');
  const css = read('style.css');
  assert.ok(/\.repo\{[^}]*min-height:44px/.test(css));
  assert.ok(!/\.repo\{min-height:(?!44px)\d+px\}/.test(css), 'a narrow-screen rule shrinks the button');
});

test('the camera on a phone crops the plinth tighter and the idle canvas is drawn at pixel ratio 2', () => {
  const src = read('scene.js');
  assert.ok(/portrait\(\) \? \{ tx: 0\.1, ty: 0\.8, span: 10,/.test(src), 'phone camera not moved');
  assert.ok(/Math\.min\(window\.devicePixelRatio \|\| 1, dprCap\)/.test(src) && /\(anim \|\| interacting\) \? 1\.5 : 2/.test(src), 'idle ratio rule missing');
});

test('with no WebGL the bead column and the page hold no plinth and sit inside the box on a phone', () => {
  assert.ok(!/fbplinth|fbplaque/.test(read('style.css') + read('site.js')), 'the fallback plinth remains');
  assert.ok(/@media \(max-width:820px\)\{[^]*\.fbbox\{[^}]*padding:14px 14px 14px 40px[^}]*\}\s*\.fbtube\{left:10px\}/.test(read('style.css')), 'the bead column is not inside the box on a phone');
});

test('a scene that cannot be rebuilt falls back and is not started', () => {
  const { calls, canvas, doc, scene } = fakes();
  scene.ok = false;
  Page.watch(canvas, doc, scene, () => calls.push('fail'));
  lose(canvas);
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  assert.deepStrictEqual(calls, ['stop', 'restore', 'fail']);
});
