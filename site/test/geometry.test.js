// run: node --test test/
const test = require('node:test');
const assert = require('node:assert');
const { PIPE } = require('../geometry.js');
const Flow = require('../flow.js');

// distance from a point in the pipe's plane to the pipe's axis: straight riser, one quarter circle, straight run
function axisDist(x, y) {
  if (y <= PIPE.bendCY) return Math.abs(x - PIPE.riserX);
  if (x >= PIPE.bendCX) return Math.abs(y - PIPE.runY);
  return Math.abs(Math.hypot(x - PIPE.bendCX, y - PIPE.bendCY) - PIPE.bendR);
}

test('the bend is one quarter circle joining the riser axis to the run axis, with a generous radius', () => {
  assert.ok(Math.abs(PIPE.bendCX - PIPE.bendR - PIPE.riserX) < 1e-9);
  assert.ok(Math.abs(PIPE.bendCY + PIPE.bendR - PIPE.runY) < 1e-9);
  assert.ok(PIPE.bendR >= 3 * PIPE.tubeR, 'bend radius ' + PIPE.bendR + ' is tight for a tube of radius ' + PIPE.tubeR);
});

test('the shader draws the riser, the bend and the run with the one tube radius, and no other pipe radius', () => {
  global.window = { Geometry: require('../geometry.js') };
  global.document = { createElement: () => ({ getContext: () => ({}) }) };
  require('../scene.js');
  const src = global.window.Scene.source;
  const f = (n) => String(n).includes('.') ? String(n) : n + '.';
  assert.ok(src.includes('const float TR=' + f(PIPE.tubeR) + ';'), 'TR is not the shared tube radius');
  assert.strictEqual((src.match(/const float TR=/g) || []).length, 1);
  assert.ok(!/0\.15\*0\.15|0\.16\*0\.16/.test(src), 'a glass pipe still uses its own radius');
  assert.ok((src.match(/\bTR\b/g) || []).length >= 6, 'riser, run and bend do not all use TR');
});

test('beads stay inside the tube all the way up the riser, round the bend and along the run', () => {
  const f = Flow.create({ full: 132, onWindow: () => {}, onGate: () => {} });
  f.seed([18, 22, 25, 30, 19, 17, 9, 6, 28, 31, 24, 23, 27, 33]);
  f.addBead(120);
  let sawBend = false, samples = 0, t = 0;
  for (let i = 0; i < 60 * 8; i++) {
    t += 1 / 60; f.step(1 / 60, t);
    const P = f.pack(); let n = 35; while (n > 0 && P[0][n * 4 + 1] < -10) n--;   // the newest live bead is the one sent up the riser
    const r = P[0][n * 4 + 3], x = P[0][n * 4], y = P[0][n * 4 + 1];
    if (y < -10 || x > -3.5 || x < PIPE.riserX - 0.01) continue;     // slot 0 and beyond is the run itself
    samples++;
    if (y > PIPE.bendCY && x < PIPE.bendCX) sawBend = true;
    assert.ok(axisDist(x, y) + r <= PIPE.tubeR + 1e-9, 'bead at ' + x.toFixed(3) + ',' + y.toFixed(3) + ' leaves the tube');
  }
  assert.ok(samples > 20 && sawBend, 'bead never went round the bend');
});
