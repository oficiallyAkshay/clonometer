/* clonometer page: what the page may say about the data file, and how it reacts to a lost graphics context. No DOM here, so node can test it. */
(function (root) {
  'use strict';
  var whole = function (n) { return typeof n === 'number' && isFinite(n) && n >= 0 && Math.floor(n) === n; };

  // the clone numbers in the data file, or null: with no real numbers the page shows none
  function clonesOf(m) {
    var c = m && m.clones;
    return c && whole(c.lifetime) && whole(c.last14d) ? { life: c.lifetime, last14d: c.last14d } : null;
  }
  // stars and watchers show from 10 stars; before that the footer shows clones only
  function showStars(m) { return !!m && whole(m.stars) && m.stars >= 10; }
  // the label of the cross-repository total: it is the sum of the owner's own repositories, and the label says so
  function totalLabel(m) {
    var tc = m && m.totalCounted;
    return tc && whole(tc.repos) && tc.repos > 0 ? 'Clones of the owner\'s own repositories' : null;
  }

  // the data file holds no daily series, so the 14 tube beads are 14 equal decoration; the 14-day figure shows only as one number
  var decor = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

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

  var api = { clonesOf: clonesOf, showStars: showStars, totalLabel: totalLabel, decor: decor, watch: watch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Page = api;
})(typeof window !== 'undefined' ? window : globalThis);
