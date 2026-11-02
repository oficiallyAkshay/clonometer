/* clonometer: the numbers the scene and the bead model share, so a test can hold both to them.
   The intake pipe rises at x = riserX, bends through one quarter torus and runs right along y = runY.
   All lengths are scene units. */
(function (root) {
  'use strict';
  var PIPE = { riserX: -4.38, runY: 2.55, z: -0.5, tubeR: 0.16, bendR: 0.55 };
  PIPE.bendCX = PIPE.riserX + PIPE.bendR;       // centre of the bend; the riser ends level with it
  PIPE.bendCY = PIPE.runY - PIPE.bendR;         // and the run starts above it
  var api = { PIPE: PIPE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Geometry = api;
})(typeof window !== 'undefined' ? window : globalThis);
