/* clonometer page: what the page may say about the data file, and how it reacts to a lost graphics context. No DOM here, so node can test it. */
(function (root) {
  'use strict';
  var whole = function (n) { return typeof n === 'number' && isFinite(n) && n >= 0 && Math.floor(n) === n; };

  // the machine runs on made-up numbers, never read from the data file, so none of it reflects a real clone count.
  // The total starts at a base that grows with the clock; every ball that reaches the counter adds its own value.
  var EPOCH = Date.UTC(2026, 0, 1), BASE = 412000, PER_SEC = 0.05, DAILY = 120;
  function machineCount(ms) { return BASE + Math.floor(Math.max(0, ms - EPOCH) / 1000 * PER_SEC); }
  // a repeatable stream of daily values with real-looking variation (about 0.14 to 3.6 times DAILY)
  function series(seed) {
    var s = seed >>> 0;
    var rnd = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    return function next() { return Math.max(1, Math.round(DAILY * Math.exp(Math.log(0.14) + rnd() * Math.log(3.6 / 0.14)))); };
  }

  // stars and watchers show from 10 stars; before that the footer shows clones only
  function showStars(m) { return !!m && whole(m.stars) && m.stars >= 10; }
  // the label of the cross-repository total: the sum over every public repository that runs clonometer
  function totalLabel(m) {
    var tc = m && m.totalCounted;
    return tc && whole(tc.repos) && tc.repos > 0 ? 'Globally tracked clones' : null;
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

  var api = { machineCount: machineCount, series: series, DAILY: DAILY, showStars: showStars, totalLabel: totalLabel, watch: watch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Page = api;
})(typeof window !== 'undefined' ? window : globalThis);
