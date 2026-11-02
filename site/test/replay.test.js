// run: node --test site/test/
const test = require('node:test');
const assert = require('node:assert');
const Flow = require('../flow.js');

const WINDOW = [18, 22, 25, 30, 19, 17, 9, 6, 28, 31, 24, 23, 27, 33];   // 312 clones in 14 days
const REAL = WINDOW.reduce((a, b) => a + b, 0);

// drive the model the way the scene does: a frame step is never longer than 0.05 s of scene time
function play(seconds, dt, hold) {
  const totals = [], gates = [];
  const f = Flow.create({ full: 132, replay: true, onWindow: (total) => totals.push(total), onGate: (c) => gates.push(c) });
  f.seed(WINDOW);
  let t = 0, worstQueue = 0;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    t += dt;
    f.step(dt, hold ? 0 : t);
    worstQueue = Math.max(worstQueue, f.queued());
    assert.strictEqual(f.total(), REAL, 'the 14-day total moved at ' + t.toFixed(2) + ' s');
    assert.strictEqual(f.sumTube(), REAL);
  }
  return { f, totals, gates, worstQueue };
}

test('the replayed stream adds beads from the scene clock and the 14-day total never moves', () => {
  const { totals, gates, f } = play(300, 1 / 60);
  assert.ok(f.landed >= 150, 'only ' + f.landed + ' beads landed');
  assert.ok(totals.every((n) => n === REAL));
  assert.strictEqual(gates.length, f.landed);
  assert.deepStrictEqual(f.problems, []);
});

test('slow frames of 0.05 s each add the same beads per scene second and the queue stays short', () => {
  const slow = play(300, 0.05), fast = play(300, 1 / 60);
  assert.ok(Math.abs(slow.f.landed - fast.f.landed) <= 3, slow.f.landed + ' against ' + fast.f.landed);
  assert.ok(slow.worstQueue <= 3);
});

test('the queue is bounded when no bead can finish', () => {
  const { worstQueue } = play(120, 0.05, true);
  assert.ok(worstQueue <= 3, 'queue grew to ' + worstQueue);
});

test('no clock, no beads: the model adds nothing when replay is off', () => {
  const f = Flow.create({ full: 132, onWindow: () => {}, onGate: () => {} });
  f.seed(WINDOW);
  for (let i = 0; i < 6000; i++) f.step(0.05, i * 0.05);
  assert.strictEqual(f.landed, 0);
});
