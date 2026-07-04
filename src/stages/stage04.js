/**
 * Stage 04: Offset brick corridors; funnels enemies into lanes.
 */

export default Object.freeze({
  id: 4,
  layout: [
    '.............',
    '.B.B.....B.B.',
    '.B.B.BBB.B.B.',
    '.B.B.....B.B.',
    '.B.B.....B.B.',
    '.B.B.....B.B.',
    '.............',
    '..B..B.B..B..',
    '..B..B.B..B..',
    '..B..B.B..B..',
    '..B..B.B..B..',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'bbbbbbfbbbhbfbbbhfff'.split(''),
  spawnInterval: 2.81,
});
