/* clonometer: the numbers the scene and the bead model share, so a test can hold both to them.
   The intake pipe rises at x = riserX, bends through one quarter torus and runs right along y = runY.
   The plaque is a card on the front of the podium. All lengths are scene units. */
(function (root) {
  'use strict';
  var PIPE = { riserX: -4.38, runY: 2.55, z: -0.5, tubeR: 0.16, bendR: 0.55 };
  PIPE.bendCX = PIPE.riserX + PIPE.bendR;       // centre of the bend; the riser ends level with it
  PIPE.bendCY = PIPE.runY - PIPE.bendR;         // and the run starts above it
  // podium front: x within +-faceHX, top at faceTop, front surface at z = faceZ; the hatch is the clickable door on it
  var FACE = { hx: 4.35, top: -2.05, z: 0.9, hatch: { x: 2.2, y: -3.7, hx: 0.42, hy: 0.33 } };
  var PLAQUE = { margin: 0.3, w: 1.6, h: 0.66, type: { name: 100, line: 46, small: 32 } };
  PLAQUE.cx = FACE.hx - PLAQUE.margin - PLAQUE.w / 2;   // right edge one margin in from the podium edge
  PLAQUE.cy = FACE.top - PLAQUE.margin - PLAQUE.h / 2;  // top edge one margin below the cap
  var api = { PIPE: PIPE, FACE: FACE, PLAQUE: PLAQUE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Geometry = api;
})(typeof window !== 'undefined' ? window : globalThis);
