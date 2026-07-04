/**
 * Stage 10: A split river forces center crossings; long brick screens.
 */

export default Object.freeze({
  id: 10,
  layout: [
    '.............',
    '.............',
    '..BBBBBBBBB..',
    '.............',
    '.............',
    '.WWWWW.WWWWW.',
    '.............',
    '.............',
    'S..BBBBBBB..S',
    '.............',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'bbbbbbfbmbhbffmfhffh'.split(''),
  spawnInterval: 2.42,
});
