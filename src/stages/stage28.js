/**
 * Stage 28: Steel horseshoe fortress; water pinches the flanks.
 */

export default Object.freeze({
  id: 28,
  layout: [
    '.............',
    '.............',
    '.............',
    '...S.....S...',
    'WW.S.....S.WW',
    'WW.S.BBB.S.WW',
    '...S.BBB.S...',
    '...S.....S...',
    '...SSS.SSS...',
    '.............',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhffhmfhfmfhfmhmh'.split(''),
  spawnInterval: 1.25,
});
