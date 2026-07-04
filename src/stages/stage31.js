/**
 * Stage 31: Three open lanes split by steel rails; pick one and commit.
 */

export default Object.freeze({
  id: 31,
  layout: [
    '.............',
    '.............',
    '...S.....S...',
    '...S.....S...',
    '...S.....S...',
    '.............',
    '...S.....S...',
    '...S.BBB.S...',
    '...S.....S...',
    '...S.....S...',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhffhmfhfmfhfmhmh'.split(''),
  spawnInterval: 1.06,
});
