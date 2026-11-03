/* clonometer page: the stream feeds the machine, the bar shows the numbers. */
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

  /* ---------- the numbers: only what metrics.json says, never changed by the stream ---------- */
  var S = { life: 0, fig: 0 };
  // c is the clone numbers of the data file; the 14-day figure shows as one number, never split into days
  function seedFrom(c) {
    S.life = c.life; S.fig = c.last14d;
    vLife.textContent = fmt(S.life); vWin.textContent = fmt(S.fig);
  }
  function digitsOf(n) { var s = String(n); while (s.length < 7) s = '0' + s; return s.slice(-7).split('').map(Number); }

  var ball = { gated: [], landed: [], left: [] };
  var vLife = $('#vLife'), vWin = $('#vWin');
  var scene = null;
  function onGate(c, on) { if (on) ball.gated.push(c); }
  function onWindow(total, cs, ev) { if (ev && ev.kind === 'land') ball.landed.push(ev.bead); if (ev && ev.kind === 'expire') ball.left.push(ev.bead); }

  /* ---------- CSS fallback: a simple version of the stream ---------- */
  // still: the real figures, nothing moves; without the data file (c is null) the poster carries no digits
  // the poster shell is in the page from the first paint; this fills in the digits
  function buildFallback(c) {
    if (!c) return;
    var html = '';
    ['d', 's', 'd', 'd', 'd', 's', 'd', 'd', 'd'].forEach(function (k) {
      if (k === 's') html += '<div class="sepc">,</div>';
      else html += '<div class="cell"><div class="strip">' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div></div>';
    });
    $('#fbwin').innerHTML = html;
    $('#fbtube').innerHTML = Page.decor.map(function () { return '<i style="width:15px;height:15px"></i>'; }).join('');
    $('#fbw').textContent = fmt(S.fig);
    var ds = digitsOf(S.life); $$('#fbwin .strip').forEach(function (s, i) { s.style.transform = 'translateY(' + (-ds[i] * 10) + '%)'; });
  }

  /* ---------- the bar: numbers from metrics.json; a number the file lacks stays hidden ---------- */
  function putFooter(m) {
    m = m || {};
    function put(k, v, li) { var el = document.querySelector('[data-k="' + k + '"]'); var on = typeof v === 'number' && v > 0; if (on) el.textContent = fmt(v); (li || el.closest('li')).hidden = !on; }
    var starry = Page.showStars(m);
    put('stars', starry ? m.stars : null); put('forks', m.forks); put('watchers', starry ? m.watchers : null);
    var c = Page.clonesOf(m) || {}, tc = m.totalCounted || {}, label = Page.totalLabel(m);
    put('clonesLife', c.life); put('clones14', c.last14d);
    put('totalCounted', label ? tc.clones : null);
    if (label) $('#liTotal .key').textContent = label;
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
  function noGL(c) { root.classList.add('nogl'); root.classList.remove('glon'); canvas.style.display = 'none'; buildFallback(c); }
  function barH() { root.style.setProperty('--barH', $('#bar').offsetHeight + 'px'); }
  barH(); addEventListener('resize', barH);

  var fontsReady = (document.fonts && document.fonts.load) ? Promise.all([
    document.fonts.load('700 100px "Archivo"'), document.fonts.load('800 100px "Archivo"'),
    document.fonts.load('400 40px "Archivo"'), document.fonts.load('600 40px "Archivo"')
  ]).catch(function () { }) : Promise.resolve();

  Promise.all([fontsReady, metricsP]).then(function (r) {
    var c = Page.clonesOf(r[1]); putFooter(r[1]);
    if (c) seedFrom(c);
    var ok = false;
    if (!c || /[?&]nogl\b/.test(location.search)) { noGL(c); return; }   // no real numbers: no machine, so no numbers on it
    try { scene = window.Scene.create(canvas, { reduce: reduce, replay: !reduce, figure: S.fig, full: 2, onGate: onGate, onWindow: onWindow }); ok = !!scene; } catch (e) { console.warn(e); scene = null; }
    if (!ok) { noGL(c); return; }
    scene.setDigits(digitsOf(S.life), !reduce);
    scene.seedTube(Page.decor, reduce ? [{ c: 2, x: -4.38, y: 0.8, z: -1.1 }, { c: 2, x: -4.38, y: 2.4, z: -1.1 }, { c: 2, x: -4.2, y: 2.0, z: -0.2 }] : []);
    scene.start();
    requestAnimationFrame(function () { requestAnimationFrame(function () { canvas.classList.add('on'); root.classList.add('glon'); }); });
    addEventListener('resize', function () { scene.resize(); });
    if (window.ResizeObserver) new ResizeObserver(function () { barH(); scene.resize(); }).observe($('#bar'));
    Page.watch(canvas, document, scene, function () { noGL(c); });
  });
})();
