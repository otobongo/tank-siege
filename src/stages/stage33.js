/**
 * Stage 33: Minimal cover, steel base screens; survive the swarm.
 */

export default Object.freeze({
  id: 33,
  layout: [
    '.............',
    '.............',
    '..B.......B..',
    '.............',
    '......B......',
    '.............',
    '....B...B....',
    '.............',
    '.............',
    '.SSSS...SSSS.',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhffhmfhfmfhfmhmh'.split(''),
  spawnInterval: 0.93,
});
