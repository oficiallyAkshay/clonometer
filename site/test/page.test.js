// run: node --test site/test/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf8');
const meta = (attr, name) => { const m = html.match(new RegExp('<meta ' + attr + '="' + name + '" content="([^"]*)"')); return m && m[1]; };

test('the page carries a social card with absolute urls', () => {
  for (const n of ['og:title', 'og:description', 'og:image']) assert.ok(meta('property', n), n);
  assert.strictEqual(meta('name', 'twitter:card'), 'summary_large_image');
  assert.match(meta('property', 'og:image'), /^https:\/\/.+\.png$/);
});

test('the card image is a png of 1200 by 630 inside the published folder', () => {
  const file = meta('property', 'og:image').split('/').pop();
  const b = fs.readFileSync(path.join(dir, file));
  assert.strictEqual(b.subarray(1, 4).toString(), 'PNG');
  assert.strictEqual(b.readUInt32BE(16), 1200);
  assert.strictEqual(b.readUInt32BE(20), 630);
});

test('the footer says clones include automated traffic', () => {
  assert.ok(html.includes('Clones include automated traffic.'));
});

test('no count is shown from the markup: every stat starts hidden until its value is set', () => {
  const items = html.match(/<li[^>]*data-tip[^>]*>/g);
  assert.strictEqual(items.length, 7);
  for (const li of items) assert.match(li, /\shidden[\s>]/);
});

test('the poster machine is in the markup and shown from the first paint, hidden only once the canvas is on', () => {
  assert.match(html, /id="fb"[^>]*>\s*<div class="fbrail"/);
  assert.match(html, /id="fbwin"/);
  assert.match(css, /\n\.fb\{display:block/);
  assert.match(css, /\.glon \.fb\{opacity:0/);
});
