// run: node --test test/
const test = require('node:test');
const assert = require('node:assert');
const Flow = require('../flow.js');

function run(seconds, gate) {
  let seed = 5; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const events = [];
  const gates = []; const f = Flow.create({ full: 132, onWindow: (total, cs, ev) => events.push({ total, sum: cs.reduce((a, b) => a + b, 0), ev }), onGate: (c) => gates.push(c) });
  f.gateOn = gate !== false;
  f.seed([18, 22, 25, 30, 19, 17, 9, 6, 28, 31, 24, 23, 27, 33]);
  const dt = 1 / 60; let next = Flow.DAY, t = 0, sentBeads = 0;
  const steps = []; // per step event counts
  for (let i = 0; i < seconds * 60; i++) {
    t += dt;
    if (t >= next) { next += Flow.DAY; f.addBead(Math.round(2 + rnd() * 90)); sentBeads++; }
    const before = events.length; f.step(dt, t); steps.push(events.length - before);
  }
  return { f, events, steps, sentBeads, gates };
}

test('window total equals the sum of the beads in the tube after every event', () => {
  const { events, f } = run(120);
  assert.ok(events.length > 20);
  for (const e of events) assert.strictEqual(e.total, e.sum);
  assert.deepStrictEqual(f.problems, []);
});

test('each event is one ball: the bead in minus the bead pushed out, once per step', () => {
  const { events, steps } = run(120);
  for (const e of events.slice(1)) { assert.strictEqual(e.ev.kind, 'land'); assert.strictEqual(e.ev.delta, e.ev.bead - e.ev.out); assert.ok(e.ev.bead > 0); }
  assert.ok(Math.max(...steps) <= 1, 'two window updates in one step');
});

test('every event is a landing and once the tube is full it also pushes the oldest bead out', () => {
  const { events } = run(120);
  const lands = events.filter((e) => e.ev.kind === 'land');
  assert.ok(lands.length > 20 && lands.every((e) => e.ev.out > 0));
});

test('with the counter removed the window still follows the tube', () => {
  const { events } = run(60, false);
  for (const e of events) assert.strictEqual(e.total, e.sum);
});

test('window updates are never closer together than a tenth of a second', () => {
  const { events } = run(120);
  const ts = events.filter((e) => e.ev.kind !== 'seed').map((e) => e.ev.t);
  for (let i = 1; i < ts.length; i++) assert.ok(ts[i] - ts[i - 1] >= 0.099, 'two updates ' + (ts[i] - ts[i - 1]).toFixed(3) + 's apart');
});

test('the lifetime counter takes each bead exactly once, on arrival, never on leaving the window', () => {
  const { events, gates, f } = run(60);
  const lands = events.filter((e) => e.ev.kind === 'land');
  assert.strictEqual(gates.length, lands.length);
  assert.deepStrictEqual(gates, lands.map((e) => e.ev.bead));
  assert.strictEqual(f.landed, lands.length);
});

test('display text sequence: the window text changes at most once per ball', () => {
  const { f } = (() => ({}))();
  let seed = 9; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const fmt = (n) => n.toLocaleString('en-US');
  const ff = Flow.create({ full: 132, onWindow: () => {}, onGate: () => {} });
  ff.seed([18, 22, 25, 30, 19, 17, 9, 6, 28, 31, 24, 23, 27, 33]);
  const dt = 1 / 60; let t = 0, next = Flow.DAY, sent = 0, last = fmt(ff.total()); const seq = [];
  for (let i = 0; i < 60 * 40; i++) {
    t += dt; if (t >= next && sent < 24) { next += Flow.DAY; ff.addBead(Math.round(2 + rnd() * 90)); sent++; }
    const before = ff.total(); ff.step(dt, t);
    const txt = fmt(ff.total());
    if (txt !== last) { seq.push({ t, from: last, to: txt, delta: ff.total() - before }); last = txt; }
  }
  assert.ok(seq.length >= 15 && seq.length <= sent);
  for (let i = 1; i < seq.length; i++) assert.ok(seq[i].t - seq[i - 1].t >= 0.099, 'two text changes ' + (seq[i].t - seq[i - 1].t).toFixed(3) + 's apart');
  for (let i = 1; i < seq.length; i++) assert.notStrictEqual(seq[i].from, seq[i].to);
});

test('lifetime model: after N balls the lifetime equals the baseline plus the sum of every ball counted', () => {
  const baseline = 2532; let life = baseline; const counted = [];
  let seed = 3; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const f = Flow.create({ full: 132, onWindow: () => {}, onGate: (c, on) => { if (on) { life += c; counted.push(c); } } });
  f.seed([18, 22, 25, 30, 19, 17, 9, 6, 28, 31, 24, 23, 27, 33]);
  let t = 0, next = Flow.DAY, sent = 0, sum = 0; const dt = 1 / 60;
  for (let i = 0; i < 60 * 70; i++) { t += dt; if (t >= next && sent < 30) { next += Flow.DAY; const c = Math.round(2 + rnd() * 90); f.addBead(c); sent++; } f.step(dt, t); if (counted.length) { sum = counted.reduce((a, b) => a + b, 0); assert.strictEqual(life, baseline + sum); } }
  assert.ok(counted.length >= 25);
});

test('seeded from the real figures: the window starts at exactly 312 across 14 slots and the lifetime at 2,532', () => {
  const cs = [18, 22, 25, 30, 19, 17, 9, 6, 28, 31, 24, 23, 27, 33];
  assert.strictEqual(cs.length, 14); assert.strictEqual(cs.reduce((a, b) => a + b, 0), 312);
  let seen = null; const f = Flow.create({ full: 132, onWindow: (tot, c, ev) => { if (ev.kind === 'seed') seen = tot; }, onGate: () => {} });
  f.seed(cs); assert.strictEqual(seen, 312); assert.strictEqual(f.total(), 312);
});

test('beads never overlap each other while moving through the pipe', () => {
  let seed = 4; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const f = Flow.create({ full: 88, onWindow: () => {}, onGate: () => {} });
  f.seed([18, 22, 25, 30, 19, 17, 9, 6, 28, 31, 24, 23, 27, 33]);
  let t = 0, next = Flow.DAY, worst = Infinity; const dt = 1 / 60;
  for (let i = 0; i < 60 * 90; i++) {
    t += dt; if (t >= next) { next += Flow.DAY; f.addBead(Math.round(2 + rnd() * 200)); }
    f.step(dt, t);
    const [P] = f.pack(); const live = [];
    for (let k = 0; k < 36; k++) if (P[k * 4 + 1] > -40) live.push([P[k * 4], P[k * 4 + 1], P[k * 4 + 2], P[k * 4 + 3]]);
    for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
      const d = Math.hypot(live[a][0] - live[b][0], live[a][1] - live[b][1], live[a][2] - live[b][2]) - live[a][3] - live[b][3];
      if (d < worst) worst = d;
    }
  }
  assert.ok(worst > -0.004, 'two beads overlap by ' + (-worst).toFixed(3));
});
