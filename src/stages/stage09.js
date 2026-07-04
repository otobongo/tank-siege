/**
 * Stage 09: Signature "I" between water notches and tree pockets.
 */

export default Object.freeze({
  id: 9,
  layout: [
    '.............',
    'WW.........WW',
    '.............',
    '....BBBBB....',
    '......B......',
    '......B......',
    '......B......',
    '....BBBBB....',
    '.............',
    '.TTT.....TTT.',
    '.TTT.....TTT.',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'bbbbbbfbmbhbfbmfhffh'.split(''),
  spawnInterval: 2.48,
});
