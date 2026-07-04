/**
 * Stage 11: Tree-roofed maze; enemies vanish under the canopy.
 */

export default Object.freeze({
  id: 11,
  layout: [
    '.............',
    '...TTTTTTT...',
    '.............',
    '.B..B...B..B.',
    '.B..BTTTB..B.',
    '.B..B...B..B.',
    '.B..B...B..B.',
    '.............',
    '..BBBBBBBBB..',
    '.............',
    '...S.....S...',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'bbbbbbfbmbhfffmfhfmh'.split(''),
  spawnInterval: 2.35,
});
