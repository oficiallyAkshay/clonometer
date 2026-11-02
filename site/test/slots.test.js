// run: node --test site/test/
const test = require('node:test');
const assert = require('node:assert');
const { windowFrom, DAYS } = require('../slots.js');

function rng(seed) { return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; }

for (const total of [0, 1, 5, 13, 14, 15, 168, 4927]) {
  test('the 14-day window for a total of ' + total + ' has 14 whole slots that sum to it', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const out = windowFrom(total, rng(seed));
      assert.strictEqual(out.length, DAYS);
      assert.strictEqual(out.reduce((a, b) => a + b, 0), total);
      assert.ok(out.every((v) => Number.isInteger(v) && v >= (total >= DAYS ? 1 : 0)));
    }
  });
}

test('a total of 0 gives 14 empty slots', () => {
  assert.deepStrictEqual(windowFrom(0, rng(3)), new Array(14).fill(0));
});

test('a total of 14 gives one clone in every slot', () => {
  assert.deepStrictEqual(windowFrom(14, rng(3)), new Array(14).fill(1));
});
