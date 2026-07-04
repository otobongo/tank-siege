/**
 * Stage 32: Scattered steel crosses; almost naked base approach.
 */

export default Object.freeze({
  id: 32,
  layout: [
    '.............',
    '.............',
    '......S......',
    '.............',
    '...S.....S...',
    '.............',
    '......S......',
    '......B......',
    '.S...B.B...S.',
    '.............',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhffhmfhfmfhfmhmh'.split(''),
  spawnInterval: 0.99,
});
