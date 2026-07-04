/**
 * Stage 08: Forest flanks hide spawns; center steel dot blocks the highway.
 */

export default Object.freeze({
  id: 8,
  layout: [
    '.............',
    '.TTT.....TTT.',
    '.TTT.....TTT.',
    '.............',
    '..B...S...B..',
    '..B.......B..',
    '..B.BBBBB.B..',
    '..B.......B..',
    '..B.......B..',
    '..B.......B..',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'bbbbbbfbmbhbfbmfhfff'.split(''),
  spawnInterval: 2.55,
});
