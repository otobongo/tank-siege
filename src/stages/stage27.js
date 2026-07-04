/**
 * Stage 27: Steel stud field; open sightlines, almost no brick.
 */

export default Object.freeze({
  id: 27,
  layout: [
    '.............',
    '.............',
    '.S..S..S..S..',
    '.....BBB.....',
    '.............',
    '.S..S..S..S..',
    '...BBB.BBB...',
    '.............',
    '.S..S..S..S..',
    '....BB.BB....',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhffhmfhfmfhfmhmh'.split(''),
  spawnInterval: 1.32,
});
