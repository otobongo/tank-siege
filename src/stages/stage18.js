/**
 * Stage 18: Ice rails between brick towers; steel walls pinch mid-field.
 */

export default Object.freeze({
  id: 18,
  layout: [
    '.............',
    '.............',
    '..B...B...B..',
    '..B...B...B..',
    '..B.I.B.I.B..',
    '..B.I.B.I.B..',
    '....I...I....',
    '.SSSI...ISSS.',
    '....I...I....',
    '....I...I....',
    '..TTT...TTT..',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhfbhmfhbmfhfbmmb'.split(''),
  spawnInterval: 1.9,
});
