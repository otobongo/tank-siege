/**
 * Stage 35: Finale: brick massif up top, one river, two crossings.
 */

export default Object.freeze({
  id: 35,
  layout: [
    '.............',
    '..BBBBBBBBB..',
    '..BBBBBBBBB..',
    '..BBBBBBBBB..',
    '..BBBBBBBBB..',
    '.............',
    'WW.WWWWWWW.WW',
    '.............',
    '....SS.SS....',
    '.BB.......BB.',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhffhmfhmmhhhhhhh'.split(''),
  spawnInterval: 0.8,
});
