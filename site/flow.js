/* clonometer: the bead model, no graphics. One pipe, one machine.
   A bead is lifted up the riser on the left, crosses the top and enters the first of 14 slots (newest at the intake).
   Every day the chain moves one slot to the right. The oldest bead leaves the 14th slot in the same update, rolls to the downward T-join (the other end of the T is taped shut)
   and drops down the stem into the clonometer counter.
   The lifetime counter takes a bead the moment it arrives at the intake, so it never lags. The window total (the GitHub counter) and the lifetime drums change together exactly once per ball: the bead that enters and the one pushed out are one update. */
(function (root) {
  'use strict';
  var PIPE = (root.Geometry || require('./geometry.js')).PIPE;
  var DAY = 1.7, RX = PIPE.riserX, PZ = PIPE.z, PY = PIPE.runY, BASE_Y = -1.8, SLOT0 = -3.55, PITCH = 0.52, N = 14, PAUSE = 0.9, PAUSE_Y = 0.0, LEAK_X = 3.72, FUN_Y = 1.96;
  var slotX = function (k) { return SLOT0 + PITCH * k; };
    var restY = function (r) { return PY - 0.15 + r; };

  function create(opts) {
    opts = opts || {};
    var full = opts.full || 2600;                    // the count that makes a full-size bead
    var rOf = function (c) { return 0.04 + 0.09 * Math.min(1, c / full); };   // wide spread: the smallest bead is a quarter the volume of a normal one, the biggest fills the tube
    var beads = [], chain = [], total = 0, stepEvents = 0, lastWin = -1, problems = [];
    var F = { DAY: DAY, problems: problems, gateOn: true, trap: 0, landed: 0 };
    function sumChain() { return chain.reduce(function (a, b) { return a + b.c; }, 0); }
    function windowEvent(kind, b, t, out) {            // one update per ball: the bead that lands and the one pushed out of the 14th slot change the total together
      var before = total, oc = out ? out.c : 0;
      total += b.c - oc;
      stepEvents++;
      var ok = sumChain() === total && total - before === b.c - oc && stepEvents === 1;
      if (!ok) { var m = 'window update inconsistent: ' + kind + ' total ' + total + ' chain ' + sumChain() + ' events this step ' + stepEvents; problems.push(m); if (typeof console !== 'undefined') console.error(m); }
      lastWin = t;
      if (opts.onWindow) opts.onWindow(total, chain.map(function (x) { return x.c; }), { kind: kind, bead: b.c, out: oc, delta: total - before, t: t });
    }
    function clash(b) {
      for (var i = 0; i < beads.length; i++) { var o = beads[i]; if (o === b || o.still || o.ph === 4 || o.ph === 5) continue;
        var dx = b.x - o.x, dy = b.y - o.y, dz = b.z - o.z; if (Math.sqrt(dx * dx + dy * dy + dz * dz) < b.r + o.r + 0.002 && (o.ph === -2 || o.ph === 8 || (o.ph === -1 && o.y > b.y))) return true; }
      return false;
    }
    F.addBead = function (c) { beads.push({ c: c, r: rOf(c), ph: -1, x: RX, y: BASE_Y, z: PZ, v: 0.8, a: 0, jx: 0, slot: -1 }); };
    // replay: the scene clock sends the oldest real day round again, one bead per day length, never more than MAXQ waiting to land.
    // With opts.next each new bead carries a fresh value, so the 14-day total moves with every ball; without it the bead is worth the one it pushes out and the total holds.
    var MAXQ = 3, acc = 0;
    F.queued = function () { return beads.filter(function (b) { return !b.still && (b.ph === 8 || (b.ph === -1 && !b.counted)); }).length; };
    function replay(dt) {
      acc = Math.min(acc + dt, DAY);
      var q = F.queued(), i = chain.length - 1 - q;
      if (acc >= DAY && q < MAXQ && chain.length === N && i >= 0) { acc -= DAY; F.addBead(opts.next ? opts.next() : chain[i].c); }
    }
    F.seed = function (cs, still) {
      // cs is oldest first; the chain keeps newest first
      var newest = cs.slice().reverse();
      chain = newest.map(function (c, k) { var r = rOf(c); return { c: c, r: r, ph: 3, x: slotX(k), y: restY(r), z: PZ, v: 0, a: 0, jx: 0, slot: k }; });
      beads = chain.slice();
      (still || []).forEach(function (s) { beads.push({ c: s.c, r: rOf(s.c), ph: 9, x: s.x, y: s.y, z: s.z, v: 0, a: 0, jx: 0, still: true }); });
      total = sumChain(); stepEvents = 0;
      if (opts.onWindow) opts.onWindow(total, chain.map(function (x) { return x.c; }), { kind: 'seed', bead: 0, delta: 0, t: 0 });
    };
    F.total = function () { return total; };
    F.tube = function () { return chain.map(function (x) { return x.c; }); };
    F.sumTube = sumChain;
    F.step = function (dt, t) {
      var moving = false; stepEvents = 0;
      if (opts.replay) replay(dt);
      for (var k = beads.length - 1; k >= 0; k--) {
        var b = beads[k];
        if (b.still) continue;
        var sv = b.ph < 0 ? { x: b.x, y: b.y, th: b.th, v: b.v } : null;
        if (b.ph === -1) {                                   // lifted up the riser that stands on the plinth
          b.v = Math.min(3.4, b.v + 3 * dt); b.y += b.v * dt; moving = true;
          if (b.y >= PIPE.bendCY) { b.ph = -2; b.v = 1.2; b.z = PZ; b.th = Math.PI; }
          else if (clash(b)) { b.y = sv.y; b.v = 0; }   // never overlap the ball ahead
          else if (!b.counted && b.y >= PAUSE_Y) { b.ph = 8; b.v = 0; b.y = PAUSE_Y; b.hold = t + PAUSE; }   // stops on the riser, to the left of the 14-day display
        } else if (b.ph === -2) {                            // round the bend, over the top and into the first slot
          b.v = Math.min(3.2, b.v + 4 * dt); moving = true;
          if (b.th > Math.PI / 2) {                      // on the arc: drifts from the axis down to the floor of the run
            b.th = Math.max(Math.PI / 2, b.th - b.v * dt / PIPE.bendR);
            var u = (Math.PI - b.th) / (Math.PI / 2), rad = PIPE.bendR - (PIPE.tubeR - b.r - 0.01) * u * u * (3 - 2 * u);
            b.x = PIPE.bendCX + rad * Math.cos(b.th); b.y = PIPE.bendCY + rad * Math.sin(b.th);          } else b.x += b.v * dt;
          if (clash(b)) { b.x = sv.x; b.y = sv.y; b.th = sv.th; b.v = 0; continue; }   // never overlap the ball ahead
          if (b.x >= PIPE.bendCX && b.th <= Math.PI / 2 + 1e-9) {   // already counted at the display: it glides into slot 0, which has been kept free
            b.x = PIPE.bendCX; b.ph = 3; b.slot = 0; b.a = 0;
          }
        } else if (b.ph === 8) {                             // waiting beside the display: the numbers change only when the pause is over
          if (t >= b.hold && stepEvents === 0 && t - lastWin >= 0.1) {
            b.counted = true; b.ph = -1; b.v = 0.8;
            chain.unshift(b);
            var out = chain.length > N ? chain.pop() : null;
            chain.forEach(function (q, i) { q.slot = i; });
            if (out) { out.ph = 4; out.v = 1.6; out.a = 0; }  // the oldest bead leaves in the same update and rolls to the T-join
            windowEvent('land', b, t, out);
            F.landed++; if (opts.onGate) opts.onGate(b.c, F.gateOn);   // the lifetime drums and the window change together, once for this ball
          }
        } else if (b.ph === 3) {                             // sits in its slot; slides one slot on when a new bead enters
          var tx = slotX(b.slot); if (Math.abs(tx - b.x) > 0.002) { b.x += (tx - b.x) * Math.min(1, dt * 10); moving = true; }
          b.a = 0;
        } else if (b.ph === 4) {                             // rolls to the leak, is caught by the tape and diverted down the funnel
          b.v = Math.min(2.6, b.v + 3 * dt); b.x += b.v * dt; moving = true;
          if (b.x >= LEAK_X) { b.x = LEAK_X; b.ph = 5; b.v = 0.4; }
        } else if (b.ph === 5) {
          b.v += 9 * dt; b.y -= b.v * dt; moving = true;
          if (b.y <= FUN_Y + b.r * 0.2) beads.splice(k, 1);   // it has dropped into the machine; the drums already hold it
        }
      }
      return moving;
    };
    F.pack = function () {
      var P = new Float32Array(36 * 4), A = new Float32Array(36);
      for (var i = 0; i < 36; i++) { var b = beads[i]; if (b) { P[i * 4] = b.x + (b.jx || 0); P[i * 4 + 1] = b.y; P[i * 4 + 2] = b.z; P[i * 4 + 3] = b.r; A[i] = b.a; } else { P[i * 4] = 0; P[i * 4 + 1] = -50; P[i * 4 + 2] = 0; P[i * 4 + 3] = 0.01; } }
      return [P, A];
    };
    return F;
  }
  var api = { create: create, DAY: DAY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Flow = api;
})(typeof window !== 'undefined' ? window : globalThis);
