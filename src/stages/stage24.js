/**
 * Stage 24: Steel colonnade; brick webbing is the only chewable path.
 */

export default Object.freeze({
  id: 24,
  layout: [
    '.............',
    '.............',
    '..S...S...S..',
    '..S.B.S.B.S..',
    '..S.B.S.B.S..',
    '..S.B...B.S..',
    '..S.B.S.B.S..',
    '..S.B.S.B.S..',
    '..S.B.S.B.S..',
    '....B...B....',
    '...BBB.BBB...',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhfbhmfhfmfhfmhmm'.split(''),
  spawnInterval: 1.51,
});
