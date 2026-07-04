/**
 * Stage 06: First water pond ringed in brick; tree ambush corners.
 */

export default Object.freeze({
  id: 6,
  layout: [
    '.............',
    '.............',
    '.TT.......TT.',
    '.TT.......TT.',
    '....BBBBB....',
    '.....WWW.....',
    '.....WWW.....',
    '....BBBBB....',
    '..B.......B..',
    '..B.......B..',
    '..B.......B..',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'bbbbbbfbmbhbfbbbhfff'.split(''),
  spawnInterval: 2.68,
});
