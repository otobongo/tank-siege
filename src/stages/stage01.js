/**
 * Stage 01: Open brick pillars; a gentle first swarm of basics.
 */

export default Object.freeze({
  id: 1,
  layout: [
    '.............',
    '.............',
    '..B.B...B.B..',
    '..B.B...B.B..',
    '..B.BBBBB.B..',
    '..B.B...B.B..',
    '..B.B...B.B..',
    '..B.B...B.B..',
    '..B.B...B.B..',
    '.............',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'bbbbbbfbbbbbfbbbbbbb'.split(''),
  spawnInterval: 3,
});
