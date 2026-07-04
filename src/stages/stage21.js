/**
 * Stage 21: Signature steel "E"; unbreakable letter, plan around it.
 */

export default Object.freeze({
  id: 21,
  layout: [
    '.............',
    '.BB.......BB.',
    '.BB.......BB.',
    '.BB.SSSSS.BB.',
    '.BB.S.....BB.',
    '.BB.SSSS..BB.',
    '.BB.S.....BB.',
    '.BB.SSSSS.BB.',
    '.BB.......BB.',
    '.............',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhfbhmfhbmfhffhmm'.split(''),
  spawnInterval: 1.71,
});
