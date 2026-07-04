/**
 * Stage 22: Water moat with two crossings into a steel redoubt.
 */

export default Object.freeze({
  id: 22,
  layout: [
    '.............',
    '.............',
    '.WW.WWWWW.WW.',
    '.............',
    '.............',
    '....SSBSS....',
    '....SBBBS....',
    '....SSSSS....',
    '.............',
    '..BBBB.BBBB..',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhfbhmfhbmfhffhmm'.split(''),
  spawnInterval: 1.64,
});
