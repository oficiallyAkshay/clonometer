/* clonometer page: the stream feeds the machine, the bar shows the numbers, the hatch opens the ledger. */
(function () {
  'use strict';
  var LICENSE_NAME = 'MIT';                 // placeholder until the licence is final
  var REPO_SLUG = 'oficiallyAkshay/clonometer';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var root = document.documentElement;
  var reduce = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || /[?&]still\b/.test(location.search);
  if (reduce) root.classList.add('rm');
  var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };

  $$('.lic').forEach(function (e) { e.textContent = LICENSE_NAME; });
  $('#lRepo').href = 'https://github.com/' + REPO_SLUG;

  /* ---------- the sample stream ---------- */
  var seed = 11;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  var S = { life: 0, win: [] }, rate = 22;
  var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
  // every ball is drawn independently on a log scale, so neighbours differ a lot: from a seventh of a typical day to three and a half times
  var lastF = 1;
  function dayCount() {
    var f, tries = 0;
    do { f = Math.exp(Math.log(0.14) + rnd() * Math.log(3.6 / 0.14)); } while (++tries < 8 && Math.abs(Math.log(f / lastF)) < 0.7);
    lastF = f;
    return Math.max(1, Math.round(rate * f * 1.1));
  }
  var windowFrom = function (total) { return window.Slots.windowFrom(total, rnd); };   // slots.js: 14 daily values that sum exactly to the real 14-day figure
  var FALLBACK = { lifetime: 1200, last14d: 168 };      // small sample, only when metrics.json has no clone numbers
  function seedFrom(m) {
    var c = m && m.clones, ok = c && typeof c.lifetime === 'number' && typeof c.last14d === 'number';
    var life = ok ? c.lifetime : FALLBACK.lifetime, w14 = ok ? c.last14d : FALLBACK.last14d;
    S.life = life; S.win = windowFrom(w14); rate = Math.max(1, w14 / 14);
    vLife.textContent = fmt(S.life); vWin.textContent = fmt(sum(S.win));
    return ok ? m : Object.assign({}, m || {}, { clones: { lifetime: life, last14d: w14 } });
  }
  function digitsOf(n) { var s = String(n); while (s.length < 7) s = '0' + s; return s.slice(-7).split('').map(Number); }
  function tickCounts(a, b) { var out = []; for (var i = 0; i < 7; i++) { var k = Math.pow(10, 6 - i); out.push(Math.floor(b / k) - Math.floor(a / k)); } return out; }

  var ball = { gated: [], landed: [], left: [] };
  var vLife = $('#vLife'), vWin = $('#vWin');
  var scene = null;
  function onGate(c, on) {
    if (!on) return;
    ball.gated.push(c);
    var old = S.life; S.life += c;
    if (scene) scene.spin(tickCounts(old, S.life));
    vLife.textContent = fmt(S.life);
  }
  function onWindow(total, cs, ev) { if (ev && ev.kind === 'land') ball.landed.push(ev.bead); if (ev && ev.kind === 'expire') ball.left.push(ev.bead); vWin.textContent = fmt(total); }

  /* ---------- CSS fallback: a simple version of the stream ---------- */
  var fbTube = [];
  function buildFallback() {
    S.win.forEach(function (c) { fbTube.push({ c: c, t: performance.now() - 5000 }); });
    fbDraw();
    if (reduce) return;
    setInterval(function () {
      if (document.hidden) return;
      var c = dayCount();
      setTimeout(function () { S.life += c; vLife.textContent = fmt(S.life); fbTube.push({ c: c, t: performance.now() }); fbDraw(); }, 1400);
    }, 900);
    setInterval(function () { var now = performance.now(); while (fbTube.length && now - fbTube[0].t > 12600) { fbTube.shift(); fbDraw(); } }, 450);
  }
  function fbDraw() {
    var tb = $('#fbtube'); if (!tb) return;
    tb.innerHTML = fbTube.map(function (b) { var d = 8 + 14 * Math.sqrt(Math.min(1, b.c / 2600)); return '<i style="width:' + d + 'px;height:' + d + 'px"></i>'; }).join('');
    var total = sum(fbTube.map(function (b) { return b.c; }));
    $('#fbw').textContent = fmt(total); vWin.textContent = fmt(total);
    var ds = digitsOf(S.life); $$('#fbwin .strip').forEach(function (s, i) { s.style.transform = 'translateY(' + (-ds[i] * 10) + '%)'; });
  }

  /* ---------- the bar: numbers from metrics.json ---------- */
  function putFooter(m) {
    function put(k, v) { var el = document.querySelector('[data-k="' + k + '"]'); if (typeof v === 'number' && v > 0) { el.textContent = fmt(v); return true; } return false; }
    ['stars', 'forks', 'watchers'].forEach(function (k) { $('[data-k="' + k + '"]').closest('li').hidden = !put(k, m[k]); });
    var c = m.clones || {}, has = put('clonesLife', c.lifetime);
    $('#liClones14').hidden = !put('clones14', c.last14d);
    $('#liClones').hidden = !has;
    var tc = m.totalCounted || {};
    $('#liTotal').hidden = !put('totalCounted', tc.clones);
    $('#liRepos').hidden = !put('repos', tc.repos);
  }
  var metricsP = fetch('metrics.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return null; });

  /* ---------- the ledger behind the hatch ---------- */
  var ledger = $('#ledger'), lastFocus = null;
  var OWNER = 'oficiallyakshay';
  function others(d) {            // consumers outside the owner's own repositories, most clones first
    return ((d && d.repositories) || []).filter(function (r) { return r && typeof r.repo === 'string' && typeof r.clones === 'number' && r.repo.toLowerCase().split('/')[0] !== OWNER; })
      .sort(function (a, b) { return b.clones - a.clones; });
  }
  var leaderP = fetch('leaderboard.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(others).catch(function () { return []; });
  var ledgerRows = [];
  function openLedger() {
    var rows = ledgerRows; if (!rows.length) return;
    var mx = rows[0].clones || 1;
    $('#ledgerList').innerHTML = rows.map(function (r, i) { return '<li><span>' + String(i + 1).padStart(2, '0') + '</span><em></em><i class="meter"><u style="width:' + Math.max(2, Math.round(r.clones / mx * 100)) + '%"></u></i><b>' + fmt(r.clones) + '</b></li>'; }).join('');
    $$('#ledgerList li em').forEach(function (e, i) { e.textContent = rows[i].repo; });
    lastFocus = document.activeElement; ledger.hidden = false; $('#ledgerX').focus();
  }
  function closeLedger() { ledger.hidden = true; if (lastFocus) lastFocus.focus(); }
  $('#ledgerX').addEventListener('click', closeLedger);
  ledger.addEventListener('click', function (e) { if (e.target === ledger) closeLedger(); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && !ledger.hidden) closeLedger(); });

  /* ---------- self-check: sample the displays every frame, over a run of balls ---------- */
  if (/[?&]selfcheck\b/.test(location.search)) window.__displayCheck = function (nBalls) {
    return new Promise(function (resolve) {
      var base = S.life, samples = [], lastW = vWin.textContent, changes = [], t0 = performance.now();
      var gated0 = ball.gated.length;
      (function tick(now) {
        var w = vWin.textContent;
        if (w !== lastW) { changes.push({ t: now - t0, from: lastW, to: w, delta: +w.replace(/,/g, '') - +lastW.replace(/,/g, '') }); lastW = w; }
        if (ball.gated.length - gated0 < nBalls + 15) return requestAnimationFrame(tick);
        var counted = ball.gated.slice(gated0), sum = counted.reduce(function (a, b) { return a + b; }, 0);
        var vals = {}; ball.landed.concat(ball.left).forEach(function (v) { vals[v] = 1; });
        var ok = changes.every(function (c) { return vals[Math.abs(c.delta)]; });
        var gaps = changes.slice(1).map(function (c, i) { return c.t - changes[i].t; });
        var drums = scene ? scene.drumDigits().join('') : null, want = digitsOf(S.life).join('');
        resolve({ balls: counted.length, windowChanges: changes.length, everyChangeIsOneBall: ok, minGapMs: Math.round(Math.min.apply(null, gaps)),
          lifetimeModel: S.life === base + sum, lifetime: S.life, baselinePlusSum: base + sum, drumsMatchLifetime: drums === want, drums: drums });
      })(performance.now());
    });
  };

  /* ---------- scene ---------- */
  var canvas = $('#gl');
  function noGL() { root.classList.remove('glon'); root.classList.add('nogl'); canvas.style.display = 'none'; buildFallback(); }
  function barH() { root.style.setProperty('--barH', $('#bar').offsetHeight + 'px'); }
  barH(); addEventListener('resize', barH);

  var fontsReady = (document.fonts && document.fonts.load) ? Promise.all([
    document.fonts.load('700 100px "Archivo"'), document.fonts.load('800 100px "Archivo"'),
    document.fonts.load('400 40px "Archivo"'), document.fonts.load('600 40px "Archivo"')
  ]).catch(function () { }) : Promise.resolve();

  Promise.all([fontsReady, metricsP, leaderP]).then(function (r) {
    ledgerRows = r[2];
    var eff = seedFrom(r[1]); putFooter(eff);
    var ok = false;
    if (/[?&]nogl\b/.test(location.search)) { noGL(); return; }
    try { scene = window.Scene.create(canvas, { reduce: reduce, win: S.win, full: rate * 4, onGate: onGate, onWindow: onWindow, onHatch: openLedger, hatch: ledgerRows.length > 0 }); ok = !!scene; } catch (e) { console.warn(e); scene = null; }
    if (!ok) { noGL(); return; }
    scene.setDigits(digitsOf(S.life), !reduce);
    scene.seedTube(S.win, reduce ? [{ c: 640, x: -4.38, y: 0.8, z: -1.1 }, { c: 2900, x: -4.38, y: 2.4, z: -1.1 }, { c: 520, x: -4.2, y: 2.0, z: -0.2 }] : []);
    scene.start();
    requestAnimationFrame(function () { requestAnimationFrame(function () { canvas.classList.add('on'); root.classList.add('glon'); }); });
    if (!reduce) setInterval(function () { if (!document.hidden) scene.addBead(dayCount()); }, scene.dayLen * 1000);
    addEventListener('resize', function () { scene.resize(); });
    if (window.ResizeObserver) new ResizeObserver(function () { barH(); scene.resize(); }).observe($('#bar'));
    document.addEventListener('visibilitychange', function () { document.hidden ? scene.stop() : scene.start(); });
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); scene.stop(); noGL(); });
  });
})();
