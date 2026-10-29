/* clonometer page: the stream feeds the machine, the bar shows the numbers, the hatch opens the ledger. */
(function () {
  'use strict';
  var LICENSE_NAME = 'MIT';                 // matches LICENSE at the repository root
  var REPO_SLUG = 'oficiallyAkshay/clonometer';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var root = document.documentElement;
  var reduce = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || /[?&]still\b/.test(location.search);
  if (reduce) root.classList.add('rm');
  var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };

  $$('.lic').forEach(function (e) { e.textContent = LICENSE_NAME; });
  $('#lRepo').href = 'https://github.com/' + REPO_SLUG;
  $('#lIssues').href = 'https://github.com/' + REPO_SLUG + '/issues';

  /* ---------- the sample stream ---------- */
  var seed = 11;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  var S = { life: 1284306, win: [702, 655, 790, 834, 711, 688, 421, 398, 812, 905, 770, 744, 689, 1263] };
  var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
  var regime = 'normal', left = 6;
  function dayCount() {
    if (--left <= 0) {
      var u = rnd();
      if (u < 0.3) { regime = 'quiet'; left = 4 + Math.floor(rnd() * 5); }
      else if (u < 0.5) { regime = 'burst'; left = 2 + Math.floor(rnd() * 3); }
      else { regime = 'normal'; left = 5 + Math.floor(rnd() * 6); }
    }
    return Math.round(regime === 'quiet' ? 15 + rnd() * 80 : regime === 'burst' ? 2200 + rnd() * 3200 : 420 + rnd() * 480);
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
    var fb = $('#fb');
    var html = '<div class="fbrail" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><div class="fbbox"><div class="fbg"><b>14 DAYS</b><span id="fbw"></span></div><div class="fbwin" id="fbwin">';
    ['d', 's', 'd', 'd', 'd', 's', 'd', 'd', 'd'].forEach(function (k) {
      if (k === 's') html += '<div class="sepc">,</div>';
      else html += '<div class="cell"><div class="strip">' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div></div>';
    });
    html += '</div><div class="fbtube" id="fbtube"></div></div><div class="fbplinth"><div class="fbplaque"><b>clonometer</b><span>In continuous service since day 1</span><i>Acc. no. 0001, 2026</i></div></div>';
    fb.innerHTML = html;
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
  (function () {
    function put(m) {
      var real = { stars: m.stars, forks: m.forks, watchers: m.watchers, issues: m.openIssues, clonesLife: m.clones && m.clones.lifetime, clones14: m.clones && m.clones.last14d, views: m.views && m.views.lifetime };
      Object.keys(real).forEach(function (k) {
        var el = document.querySelector('[data-k="' + k + '"]'), li = el.closest('li');
        if (typeof real[k] === 'number' && real[k] > 0) { el.textContent = fmt(real[k]); li.hidden = false; } else li.hidden = true;   // no number or zero: hidden
      });
    }
    fetch('metrics.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(put).catch(function () { });
  })();

  /* ---------- the ledger behind the hatch ---------- */
  var ledger = $('#ledger'), lastFocus = null;
  function openLedger() {
    fetch('leaderboard.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      var rows = (d.repositories || []).slice().sort(function (a, b) { return b.clones - a.clones; });
      $('#ledgerList').innerHTML = rows.map(function (r, i) { return '<li><span>' + String(i + 1).padStart(2, '0') + '</span><em></em><b>' + fmt(r.clones) + '</b></li>'; }).join('');
      $$('#ledgerList li em').forEach(function (e, i) { e.textContent = rows[i].repo; });
      lastFocus = document.activeElement; ledger.hidden = false; $('#ledgerX').focus();
    }).catch(function () { });
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
  function noGL() { root.classList.add('nogl'); canvas.style.display = 'none'; buildFallback(); }
  function barH() { root.style.setProperty('--barH', $('#bar').offsetHeight + 'px'); }
  barH(); addEventListener('resize', barH);

  var fontsReady = (document.fonts && document.fonts.load) ? Promise.all([
    document.fonts.load('700 100px "Archivo"'), document.fonts.load('800 100px "Archivo"'),
    document.fonts.load('400 40px "Archivo"'), document.fonts.load('600 40px "Archivo"')
  ]).catch(function () { }) : Promise.resolve();

  fontsReady.then(function () {
    var ok = false;
    if (/[?&]nogl\b/.test(location.search)) { noGL(); return; }
    try { scene = window.Scene.create(canvas, { reduce: reduce, win: S.win, onGate: onGate, onWindow: onWindow, onHatch: openLedger }); ok = !!scene; } catch (e) { console.warn(e); scene = null; }
    if (!ok) { noGL(); return; }
    scene.setDigits(digitsOf(S.life), !reduce);
    scene.seedTube(S.win, reduce ? [{ c: 640, x: -4.38, y: 0.8, z: -1.1 }, { c: 2900, x: -4.38, y: 2.4, z: -1.1 }, { c: 520, x: -4.2, y: 2.0, z: -0.2 }] : []);
    scene.start();
    if (!reduce) setInterval(function () { if (!document.hidden) scene.addBead(dayCount()); }, scene.dayLen * 1000);
    addEventListener('resize', function () { scene.resize(); });
    if (window.ResizeObserver) new ResizeObserver(function () { barH(); scene.resize(); }).observe($('#bar'));
    document.addEventListener('visibilitychange', function () { document.hidden ? scene.stop() : scene.start(); });
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); scene.stop(); noGL(); });
  });
})();
