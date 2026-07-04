/**
 * Stage 07: Twin lakes with a forested causeway; steel plug guards the base.
 */

export default Object.freeze({
  id: 7,
  layout: [
    '.............',
    '.............',
    '.............',
    '.....TTT.....',
    '.WWWWTTTWWWW.',
    '.....TTT.....',
    '.............',
    '..BBBBBBBBB..',
    '.............',
    '......S......',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'bbbbbbfbmbhbfbmbhfff'.split(''),
  spawnInterval: 2.61,
});
