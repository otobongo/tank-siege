/**
 * Stage 14: Ice belt up top speeds enemy descents; steel core below.
 */

export default Object.freeze({
  id: 14,
  layout: [
    '.............',
    '.............',
    '.IIIIIIIIIII.',
    '.IIIIIIIIIII.',
    '.............',
    '..B.B...B.B..',
    '..B.BSSSB.B..',
    '..B.B...B.B..',
    '..B.B...B.B..',
    '.............',
    '...BBBBBBB...',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhfbhmfhbmffmbbbb'.split(''),
  spawnInterval: 2.16,
});
