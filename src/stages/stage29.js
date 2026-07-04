/**
 * Stage 29: Open killing field; six steel studs, one brick screen.
 */

export default Object.freeze({
  id: 29,
  layout: [
    '.............',
    '.............',
    '.............',
    '..S.......S..',
    '.....BBB.....',
    '.............',
    '....S...S....',
    '.............',
    '.............',
    '..S.......S..',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhffhmfhfmfhfmhmh'.split(''),
  spawnInterval: 1.19,
});
