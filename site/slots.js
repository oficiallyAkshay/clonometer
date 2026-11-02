/* clonometer: spreads a 14-day clone total over 14 daily slots that sum exactly to it.
   Every slot holds at least one clone when the total allows it; under 14 clones some slots are empty. No loop, so no total can hang the page. */
(function (root) {
  'use strict';
  var DAYS = 14;
  function windowFrom(total, rnd) {
    var n = Math.max(0, Math.round(total)) || 0, w = [], s = 0, i;
    for (i = 0; i < DAYS; i++) { var v = Math.exp(Math.log(0.14) + rnd() * Math.log(3.6 / 0.14)); w.push(v); s += v; }
    var base = n >= DAYS ? 1 : 0, rest = n - base * DAYS;
    var out = w.map(function (v) { return base + Math.floor(v / s * rest); });
    var left = n - out.reduce(function (a, b) { return a + b; }, 0);       // fewer than 14 left: one more for the largest fractions
    var order = w.map(function (v, k) { return k; }).sort(function (a, b) { var fa = w[a] / s * rest % 1, fb = w[b] / s * rest % 1; return fb - fa || a - b; });
    for (i = 0; i < left; i++) out[order[i]]++;
    return out;
  }
  var api = { windowFrom: windowFrom, DAYS: DAYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Slots = api;
})(typeof window !== 'undefined' ? window : globalThis);
