/**
 * Stage 19: Ice field almost wall to wall; the only cover is brick islands.
 */

export default Object.freeze({
  id: 19,
  layout: [
    '.............',
    '.............',
    'IIIIIIIIIIIII',
    'IIBBBIIIBBBII',
    'IIBBBIIIBBBII',
    'IIIIIIIIIIIII',
    'IIIIBBSBBIIII',
    'IIIIIIIIIIIII',
    'IIIIIIIIIIIII',
    '.............',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhfbhmfhbmfhfbfmm'.split(''),
  spawnInterval: 1.84,
});
