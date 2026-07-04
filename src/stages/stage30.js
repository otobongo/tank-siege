/**
 * Stage 30: Signature brick tank silhouette; ironic cover.
 */

export default Object.freeze({
  id: 30,
  layout: [
    '.............',
    '.............',
    '..S.......S..',
    '......B......',
    '.....BBB.....',
    '....BBBBB....',
    '....BBBBB....',
    '...B.....B...',
    '.............',
    '.............',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhffhmfhfmfhfmhmh'.split(''),
  spawnInterval: 1.12,
});
