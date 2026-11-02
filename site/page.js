/* clonometer page: what the page may say about the data file, and how it reacts to a lost graphics context. No DOM here, so node can test it. */
(function (root) {
  'use strict';
  var DATE = /^\d{4}-\d{2}-\d{2}$/;
  var whole = function (n) { return typeof n === 'number' && isFinite(n) && n >= 0 && Math.floor(n) === n; };

  // the clone numbers in the data file, or null: with no real numbers the page shows none
  function clonesOf(m) {
    var c = m && m.clones;
    return c && whole(c.lifetime) && whole(c.last14d) ? { life: c.lifetime, last14d: c.last14d } : null;
  }
  // the label of the cross-repository total: it is the sum of the owner's own repositories
  function totalLabel(m) {
    var tc = m && m.totalCounted;
    return tc && whole(tc.repos) && tc.repos > 0 ? 'Across my ' + tc.repos + ' repos' : null;
  }
  function updatedOf(m) { return m && typeof m.updated === 'string' && DATE.test(m.updated) ? m.updated : null; }

  // 14 daily values with realistic variation that sum exactly to the real 14-day figure
  function windowFrom(total, rnd) {
    var w = [], s = 0, i, out;
    for (i = 0; i < 14; i++) { var v = Math.exp(Math.log(0.14) + rnd() * Math.log(3.6 / 0.14)); w.push(v); s += v; }
    out = w.map(function (v) { return Math.round(v / s * total); });
    var diff = total - out.reduce(function (a, b) { return a + b; }, 0), k = 0;
    while (diff !== 0) { var idx = k++ % 14; if (diff > 0) { out[idx]++; diff--; } else if (out[idx] > 0) { out[idx]--; diff++; } }
    return out;
  }

  // the scene runs only while the page is visible and the graphics context is alive; a restored context rebuilds the scene and resumes it
  function watch(canvas, doc, scene, onFail) {
    var lost = false;
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); lost = true; scene.stop(); });
    canvas.addEventListener('webglcontextrestored', function () {
      if (!scene.restore()) { onFail(); return; }
      lost = false; if (!doc.hidden) scene.start();
    });
    doc.addEventListener('visibilitychange', function () { if (doc.hidden) scene.stop(); else if (!lost) scene.start(); });
  }

  var api = { clonesOf: clonesOf, totalLabel: totalLabel, updatedOf: updatedOf, windowFrom: windowFrom, watch: watch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Page = api;
})(typeof window !== 'undefined' ? window : globalThis);
