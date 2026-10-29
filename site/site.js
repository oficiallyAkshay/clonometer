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
  $('#lIssues').href = 'https://github.com/' + REPO_SLUG + '/issues';

  /* ---------- the sample stream ---------- */
  var seed = 11;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  var S = { life: 0, win: [] }, rate = 22;
  var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
  var regime = 'normal', left = 6;
  function dayCount() {          // stream averages the real daily rate: quiet stretches, normal days, occasional bursts
    if (--left <= 0) {
      var u = rnd();
      if (u < 0.3) { regime = 'quiet'; left = 4 + Math.floor(rnd() * 5); }
      else if (u < 0.5) { regime = 'burst'; left = 2 + Math.floor(rnd() * 3); }
      else { regime = 'normal'; left = 5 + Math.floor(rnd() * 6); }
    }
    var f = regime === 'quiet' ? 0.05 + rnd() * 0.25 : regime === 'burst' ? 2.4 + rnd() * 2.2 : 0.55 + rnd() * 0.6;
    return Math.max(1, Math.round(rate * f));
  }
  // 14 daily values with realistic variation that sum exactly to the real 14-day figure
  function windowFrom(total) {
    var w = [], s = 0, i; for (i = 0; i < 14; i++) { var v = 0.4 + rnd() * 1.2; if (i === 6 || i === 7) v *= 0.45; w.push(v); s += v; }
    var out = w.map(function (v) { return Math.max(1, Math.round(v / s * total)); });
    var diff = total - sum(out), k = 0; while (diff !== 0) { var idx = k++ % 14; if (diff > 0) { out[idx]++; diff--; } else if (out[idx] > 1) { out[idx]--; diff++; } }
    return out;
  }
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
  function putFooter(m) {
    var real = { stars: m.stars, forks: m.forks, watchers: m.watchers, issues: m.openIssues, clonesLife: m.clones && m.clones.lifetime, clones14: m.clones && m.clones.last14d, views: m.views && m.views.lifetime };
    Object.keys(real).forEach(function (k) {
      var el = document.querySelector('[data-k="' + k + '"]'), li = el.closest('li');
      if (typeof real[k] === 'number' && real[k] > 0) { el.textContent = fmt(real[k]); li.hidden = false; } else li.hidden = true;   // no number or zero: hidden
    });
  }
  var metricsP = fetch('metrics.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return null; });

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

  Promise.all([fontsReady, metricsP]).then(function (r) {
    var eff = seedFrom(r[1]); putFooter(eff);
    var ok = false;
    if (/[?&]nogl\b/.test(location.search)) { noGL(); return; }
    try { scene = window.Scene.create(canvas, { reduce: reduce, win: S.win, full: rate * 6, onGate: onGate, onWindow: onWindow, onHatch: openLedger }); ok = !!scene; } catch (e) { console.warn(e); scene = null; }
    if (!ok) { noGL(); return; }
    scene.setDigits(digitsOf(S.life), !reduce);
    scene.seedTube(S.win, reduce ? [{ c: 640, x: -4.38, y: 0.8, z: -1.1 }, { c: 2900, x: -4.38, y: 2.4, z: -1.1 }, { c: 520, x: -4.2, y: 2.0, z: -0.2 }] : []);
    scene.start();
    requestAnimationFrame(function () { requestAnimationFrame(function () { canvas.classList.add('on'); }); });
    if (!reduce) setInterval(function () { if (!document.hidden) scene.addBead(dayCount()); }, scene.dayLen * 1000);
    addEventListener('resize', function () { scene.resize(); });
    if (window.ResizeObserver) new ResizeObserver(function () { barH(); scene.resize(); }).observe($('#bar'));
    document.addEventListener('visibilitychange', function () { document.hidden ? scene.stop() : scene.start(); });
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); scene.stop(); noGL(); });
  });
})();
