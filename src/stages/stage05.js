/**
 * Stage 05: Signature "S"; the letter is cover and obstacle at once.
 */

export default Object.freeze({
  id: 5,
  layout: [
    '.............',
    '.............',
    '.B.........B.',
    '.B..BBBBB..B.',
    '.B..B......B.',
    '.B..BBBBB..B.',
    '.B......B..B.',
    '.B..BBBBB..B.',
    '.B.........B.',
    '.B.........B.',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'bbbbbbfbmbhbfbbbhfff'.split(''),
  spawnInterval: 2.74,
});
