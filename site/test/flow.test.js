// run: node --test test/
const test = require('node:test');
const assert = require('node:assert');
const Flow = require('../flow.js');

function run(seconds, gate) {
  let seed = 5; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const events = [];
  const gates = []; const f = Flow.create({ onWindow: (total, cs, ev) => events.push({ total, sum: cs.reduce((a, b) => a + b, 0), ev }), onGate: (c) => gates.push(c) });
  f.gateOn = gate !== false;
  f.seed([702, 655, 790, 834, 711, 688, 421, 398, 812, 905, 770, 744, 689, 1263]);
  const dt = 1 / 60; let next = 0.9, t = 0, sentBeads = 0;
  const steps = []; // per step event counts
  for (let i = 0; i < seconds * 60; i++) {
    t += dt;
    if (t >= next) { next += 0.9; f.addBead(Math.round(15 + rnd() * 4000)); sentBeads++; }
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

test('each event changes the total by exactly one bead, once per step', () => {
  const { events, steps } = run(120);
  for (const e of events.slice(1)) { assert.ok(e.ev.kind === 'land' || e.ev.kind === 'expire'); assert.strictEqual(Math.abs(e.ev.delta), e.ev.bead); assert.ok(e.ev.bead > 0); }
  assert.ok(Math.max(...steps) <= 1, 'two window updates in one step');
});

test('landing and releasing never happen for the same bead event and alternate cleanly', () => {
  const { events } = run(120);
  const land = events.filter((e) => e.ev.kind === 'land').length, exp = events.filter((e) => e.ev.kind === 'expire').length;
  assert.ok(land > 0 && exp > 0 && Math.abs(land - exp) <= 15);
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

test('display text sequence: the window text changes exactly once per ball entering and once per ball leaving', () => {
  const { f } = (() => ({}))();
  let seed = 9; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const fmt = (n) => n.toLocaleString('en-US');
  const ff = Flow.create({ onWindow: () => {}, onGate: () => {} });
  ff.seed([702, 655, 790, 834, 711, 688, 421, 398, 812, 905, 770, 744, 689, 1263]);
  const dt = 1 / 60; let t = 0, next = 0.9, sent = 0, last = fmt(ff.total()); const seq = [];
  for (let i = 0; i < 60 * 40; i++) {
    t += dt; if (t >= next && sent < 24) { next += 0.9; ff.addBead(Math.round(15 + rnd() * 4000)); sent++; }
    const before = ff.total(); ff.step(dt, t);
    const txt = fmt(ff.total());
    if (txt !== last) { seq.push({ t, from: last, to: txt, delta: ff.total() - before }); last = txt; }
  }
  const lands = seq.filter((s) => s.delta > 0), outs = seq.filter((s) => s.delta < 0);
  assert.ok(lands.length >= 20 && outs.length >= 8);
  for (let i = 1; i < seq.length; i++) assert.ok(seq[i].t - seq[i - 1].t >= 0.099, 'two text changes ' + (seq[i].t - seq[i - 1].t).toFixed(3) + 's apart');
  for (let i = 1; i < seq.length; i++) assert.notStrictEqual(seq[i].from, seq[i].to);
});

test('lifetime model: after N balls the lifetime equals the baseline plus the sum of every ball counted', () => {
  const baseline = 1284306; let life = baseline; const counted = [];
  let seed = 3; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const f = Flow.create({ onWindow: () => {}, onGate: (c, on) => { if (on) { life += c; counted.push(c); } } });
  f.seed([702, 655, 790, 834, 711, 688, 421, 398, 812, 905, 770, 744, 689, 1263]);
  let t = 0, next = 0.9, sent = 0, sum = 0; const dt = 1 / 60;
  for (let i = 0; i < 60 * 40; i++) { t += dt; if (t >= next && sent < 30) { next += 0.9; const c = Math.round(15 + rnd() * 4000); f.addBead(c); sent++; } f.step(dt, t); if (counted.length) { sum = counted.reduce((a, b) => a + b, 0); assert.strictEqual(life, baseline + sum); } }
  assert.ok(counted.length >= 25);
});
