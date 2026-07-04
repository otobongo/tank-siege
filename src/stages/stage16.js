/**
 * Stage 16: Brick staircases over ice aprons; watch the base gaps.
 */

export default Object.freeze({
  id: 16,
  layout: [
    '.............',
    '.............',
    '.BB........B.',
    '...BB....B...',
    '.....BBB.....',
    '.....B.BB....',
    '...B.....BB..',
    '.............',
    '.IIII...IIII.',
    '.IIIIBBBIIII.',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhfbhmfhbmfhfbmbb'.split(''),
  spawnInterval: 2.03,
});
