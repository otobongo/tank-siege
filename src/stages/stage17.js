/**
 * Stage 17: Signature "G"; ice ceiling makes the top row treacherous.
 */

export default Object.freeze({
  id: 17,
  layout: [
    '.............',
    '.IIIII.IIIII.',
    '.IIIIIIIIIII.',
    '.............',
    '....BBBBB....',
    '....B........',
    '....B.BBB....',
    '....B...B....',
    '....BBBBB....',
    '.............',
    '.SS.......SS.',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhfbhmfhbmfhfbmmb'.split(''),
  spawnInterval: 1.96,
});
