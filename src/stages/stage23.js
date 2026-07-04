/**
 * Stage 23: Moat line with side crossings; steel bunkers cover both.
 */

export default Object.freeze({
  id: 23,
  layout: [
    '.............',
    '.............',
    '.............',
    '.W.WWWWWWW.W.',
    '.............',
    '..SS.....SS..',
    '..SS.BBB.SS..',
    '.....BBB.....',
    '.............',
    '.B.BBBBBBB.B.',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhfbhmfhbmfhffhmm'.split(''),
  spawnInterval: 1.58,
});
