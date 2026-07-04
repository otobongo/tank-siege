/**
 * Stage 13: Signature "E"; an ice sheet drags you toward the flank.
 */

export default Object.freeze({
  id: 13,
  layout: [
    '.............',
    '.............',
    '.........IIII',
    '...BBBBB.IIII',
    '...B.....IIII',
    '...BBBB..IIII',
    '...B.....IIII',
    '...BBBBB.IIII',
    '.........IIII',
    '.BBB.........',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhfbhmfhbmfmbbbbb'.split(''),
  spawnInterval: 2.22,
});
