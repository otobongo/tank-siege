/**
 * Stage 20: Tight funnel to the base; steel plugs punish lazy routes.
 */

export default Object.freeze({
  id: 20,
  layout: [
    '.............',
    '.............',
    '.BBBBB.BBBBB.',
    '.............',
    '...B.....B...',
    '...B.III.B...',
    '...S.....S...',
    '...B.....B...',
    '...B.....B...',
    '...BBB.BBB...',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhfbhmfhbmfhfbhmm'.split(''),
  spawnInterval: 1.77,
});
