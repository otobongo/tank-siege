/**
 * Stage 34: Steel chevron funnels everything to the middle; no hiding.
 */

export default Object.freeze({
  id: 34,
  layout: [
    '.............',
    '.............',
    '.S.........S.',
    '..S.......S..',
    '...S.....S...',
    '....S...S....',
    '.....S.S.....',
    '.............',
    '......B......',
    '.............',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhffhmfhfmfhffhmh'.split(''),
  spawnInterval: 0.86,
});
