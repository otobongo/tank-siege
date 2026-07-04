/**
 * Stage 03: Brick checkerboard; crossfire practice with fast tanks.
 */

export default Object.freeze({
  id: 3,
  layout: [
    '.............',
    '.............',
    '.B.B.B.B.B.B.',
    '.............',
    '.B.B.B.B.B.B.',
    '.............',
    '.B.B.B.B.B.B.',
    '.............',
    '.B.B.B.B.B.B.',
    '.............',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'bbbbbbfbbbhbfbbbhbff'.split(''),
  spawnInterval: 2.87,
});
