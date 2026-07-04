/**
 * Stage 12: Water moat around a brick keep; two narrow entries.
 */

export default Object.freeze({
  id: 12,
  layout: [
    '.............',
    'S...........S',
    '.............',
    '...WWW.WWW...',
    '...W.....W...',
    '...W.BBB.W...',
    '...W.BBB.W...',
    '...W.....W...',
    '...W.....W...',
    '....BBBBB....',
    '.............',
    '.............',
    '.............',
  ],
  // Spawn order; indices 3, 10, 17 become bonus tanks.
  enemies: 'bbbbbbfbmbhfffmfhfmh'.split(''),
  spawnInterval: 2.29,
});
