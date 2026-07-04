/**
 * Stage 15: Frozen lake center; brick cross gives sliding cover.
 */

export default Object.freeze({
  id: 15,
  layout: [
    '.............',
    '.S.........S.',
    '......B......',
    '......B......',
    '....IIBII....',
    '..BBBBBBBBB..',
    '....IIBII....',
    '....IIBII....',
    '......B......',
    '..BBB.B.BBB..',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'ffmfhfbhmfhbmfhmbbbb'.split(''),
  spawnInterval: 2.09,
});
