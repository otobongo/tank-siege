/**
 * Stage 25: Signature arrow pointing at your base; the enemy agrees.
 */

export default Object.freeze({
  id: 25,
  layout: [
    '.............',
    '.....BBB.....',
    '.....BBB.....',
    '.B...BBB...B.',
    '.B...BBB...B.',
    '.B.SSSBSSS.B.',
    '.B..BBBBB..B.',
    '.B...BBB...B.',
    '.B....B....B.',
    '.B.........B.',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhfbhmfhfmfhfmhmm'.split(''),
  spawnInterval: 1.45,
});
