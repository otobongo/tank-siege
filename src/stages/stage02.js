/**
 * Stage 02: Broken brick bars; first heavies appear on the flanks.
 */

export default Object.freeze({
  id: 2,
  layout: [
    '.............',
    '.............',
    '.............',
    '.BBBBB.BBBBB.',
    '.............',
    '.............',
    '.............',
    '.BBBB...BBBB.',
    '.............',
    '..B.......B..',
    '..B.......B..',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'bbbbbbfbbbhbfbbbhbff'.split(''),
  spawnInterval: 2.94,
});
