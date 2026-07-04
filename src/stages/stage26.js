/**
 * Stage 26: Double moat with offset gaps; steel islands between.
 */

export default Object.freeze({
  id: 26,
  layout: [
    '.............',
    '.............',
    '.WWW.WWWWWWW.',
    '.............',
    '.....SBS.....',
    '.....SSS.....',
    '.............',
    '.WWWWWWW.WWW.',
    '.............',
    '..SSS...SSS..',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhfbhmfhfmfhfmhmh'.split(''),
  spawnInterval: 1.38,
});
