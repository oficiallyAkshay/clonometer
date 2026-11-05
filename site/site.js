/* clonometer page: the machine counts up on its own, the bar shows the numbers. */
(function () {
  'use strict';
  var REPO_SLUG = 'oficiallyAkshay/clonometer';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var root = document.documentElement;
  var reduce = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || /[?&]still\b/.test(location.search);
  if (reduce) root.classList.add('rm');
  var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };

  $('#lRepo').href = 'https://github.com/' + REPO_SLUG;

  /* ---------- the machine's numbers: made up, never the real clone counts; each ball that lands moves them ---------- */
  var next = Page.series(11);
  var S = { life: Page.machineCount(Date.now()), win: [], fig: 0 };
  for (var i = 0; i < 14; i++) S.win.push(next());
  S.fig = S.win.reduce(function (a, b) { return a + b; }, 0);
  function digitsOf(n) { var s = String(n); while (s.length < 7) s = '0' + s; return s.slice(-7).split('').map(Number); }
  function show() { vLife.textContent = fmt(S.life); vWin.textContent = fmt(S.fig); }

  var ball = { gated: [], landed: [], left: [] };
  var vLife = $('#vLife'), vWin = $('#vWin');
  var scene = null;
  function onGate(c, on) { if (!on) return; ball.gated.push(c); S.life += c; show(); if (scene) scene.rollDigits(digitsOf(S.life)); }
  function onWindow(total, cs, ev) { if (ev && ev.kind === 'land') ball.landed.push(ev.bead); if (ev && ev.kind === 'expire') ball.left.push(ev.bead); S.fig = total; show(); }

  /* ---------- the bar: numbers from metrics.json; a number the file lacks stays hidden ---------- */
  function putFooter(m) {
    m = m || {};
    function put(k, v, li) { var el = document.querySelector('[data-k="' + k + '"]'); var on = typeof v === 'number' && v > 0; if (on) el.textContent = fmt(v); (li || el.closest('li')).hidden = !on; }
    var starry = Page.showStars(m);
    put('stars', starry ? m.stars : null); put('forks', m.forks); put('watchers', starry ? m.watchers : null);
    var tc = m.totalCounted || {}, label = Page.totalLabel(m);
    put('totalCounted', label ? tc.clones : null);
    put('repos', tc.repos);
    if (tc.repos > 0) $('[data-k="repos"]').textContent += ' repos';
  }
  var metricsP = fetch('metrics.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });

  /* ---------- self-check: sample the displays every frame, over a run of balls ---------- */
  if (/[?&]selfcheck\b/.test(location.search)) window.__displayCheck = function (nBalls) {
    return new Promise(function (resolve) {
      var base = S.life, samples = [], lastW = vWin.textContent, changes = [], t0 = performance.now();
      var gated0 = ball.gated.length;
      (function tick(now) {
        var w = vWin.textContent;
        if (w !== lastW) { changes.push({ t: now - t0, from: lastW, to: w, delta: +w.replace(/,/g, '') - +lastW.replace(/,/g, '') }); lastW = w; }
        if (ball.gated.length - gated0 < nBalls + 15) return requestAnimationFrame(tick);
        var counted = ball.gated.slice(gated0);
        var vals = {}; ball.landed.concat(ball.left).forEach(function (v) { vals[v] = 1; });
        var ok = changes.every(function (c) { return vals[Math.abs(c.delta)]; });
        var gaps = changes.slice(1).map(function (c, i) { return c.t - changes[i].t; });
        var drums = scene ? scene.drumDigits().join('') : null, want = digitsOf(S.life).join('');
        resolve({ balls: counted.length, windowChanges: changes.length, everyChangeIsOneBall: ok, minGapMs: Math.round(Math.min.apply(null, gaps)),
          lifetimeFrozen: S.life === base, windowFrozen: changes.length === 0, lifetime: S.life, drumsMatchLifetime: drums === want, drums: drums });
      })(performance.now());
    });
  };

  /* ---------- scene ---------- */
  var canvas = $('#gl');
  // the loading panel stays in place; with no 3D support only its words change
  function noGL() { root.classList.add('nogl'); root.classList.remove('glon'); canvas.style.display = 'none'; $('#ltxt').textContent = 'This view needs WebGL 2'; }
  function barH() { root.style.setProperty('--barH', $('#bar').offsetHeight + 'px'); }
  barH(); addEventListener('resize', barH);
  show();

  var fontsReady = (document.fonts && document.fonts.load) ? Promise.all([
    document.fonts.load('700 100px "Archivo"'), document.fonts.load('800 100px "Archivo"'),
    document.fonts.load('400 40px "Archivo"'), document.fonts.load('600 40px "Archivo"')
  ]).catch(function () { }) : Promise.resolve();

  metricsP.then(putFooter);
  fontsReady.then(function () {
    var ok = false;
    if (/[?&]nogl\b/.test(location.search)) { noGL(); return; }
    try { scene = window.Scene.create(canvas, { reduce: reduce, replay: !reduce, win: S.win, next: next, full: Page.DAILY * 4, onGate: onGate, onWindow: onWindow }); ok = !!scene; } catch (e) { console.warn(e); scene = null; }
    if (!ok) { noGL(); return; }
    scene.setDigits(digitsOf(S.life), !reduce);
    scene.seedTube(S.win, reduce ? [{ c: 90, x: -4.38, y: 0.8, z: -1.1 }, { c: 400, x: -4.38, y: 2.4, z: -1.1 }, { c: 60, x: -4.2, y: 2.0, z: -0.2 }] : []);
    scene.start();
    requestAnimationFrame(function () { requestAnimationFrame(function () { canvas.classList.add('on'); root.classList.add('glon'); }); });
    addEventListener('resize', function () { scene.resize(); });
    if (window.ResizeObserver) new ResizeObserver(function () { barH(); scene.resize(); }).observe($('#bar'));
    Page.watch(canvas, document, scene, noGL);
  });
})();
