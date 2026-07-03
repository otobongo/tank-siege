/**
 * All tunable game constants (single source of truth).
 * Every speed, duration, dimension, score value, color, and default
 * input map lives here. No other module may hard-code these values.
 *
 * Units: distances in logical canvas pixels, speeds in pixels per
 * second, durations in seconds. The simulation runs at a fixed 60Hz
 * (see loop.js); systems convert with dt.
 */

function deepFreeze(obj) {
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return Object.freeze(obj);
}

export const CONFIG = deepFreeze({
  canvas: {
    width: 544, // playfield + sidebar
    height: 416,
    playfieldWidth: 416,
    playfieldHeight: 416,
    sidebarWidth: 128,
  },

  grid: {
    blocks: 13, // stage authoring resolution (13x13)
    halfCells: 26, // movement/collision resolution (26x26)
    quarterCells: 52, // brick damage resolution (52x52)
    blockPx: 32,
    halfCellPx: 16,
    quarterCellPx: 8,
    lanePx: 8, // tanks snap to 8px lanes when turning
    laneSnapThresholdPx: 6, // max distance a turn will snap
  },

  simulation: {
    updateHz: 60,
    maxAccumulatedMs: 250, // spiral-of-death clamp
  },

  tank: {
    sizePx: 32, // 2x2 half-cells
    player: {
      // Indexed by tier (1-4). Tier is the Star upgrade ladder.
      speedByTier: [null, 96, 96, 96, 96],
      bulletSpeedByTier: [null, 192, 288, 288, 288],
      bulletCapByTier: [null, 1, 1, 2, 2],
      steelDestroyTier: 4,
      brickDepthByTier: [null, 2, 2, 2, 4], // quarter-cells removed per hit
      fireCooldown: 0.15,
      spawnInvulnerability: 3.0,
      spawnAnimDuration: 0.8,
      startLives: 3,
      // Spawn columns in blocks, measured from playfield left; row is the
      // bottom row. Base sits at columns 6-7 (bottom-center).
      p1SpawnBlock: 4,
      p2SpawnBlock: 8,
    },
    enemy: {
      // Speeds: slow / normal / fastest. Bullet: slow / normal / fast.
      basic: { hp: 1, speed: 48, bulletSpeed: 192, points: 100 },
      fast: { hp: 1, speed: 120, bulletSpeed: 256, points: 200 },
      power: { hp: 1, speed: 72, bulletSpeed: 320, points: 300 },
      heavy: { hp: 4, speed: 48, bulletSpeed: 256, points: 400 },
      bulletCap: 1,
      spawnTelegraphDuration: 1.0, // sparkle before materializing
    },
  },

  bullet: {
    sizePx: 8,
    // Damage swath: 4 quarter-cells wide, depth per tier above.
    brickSwathWidth: 4,
  },

  spawner: {
    maxOnField: { onePlayer: 4, twoPlayer: 6 },
    enemiesPerStage: 20,
    bonusIndices: [3, 10, 17], // 0-based: the 4th, 11th, 18th tank
    // Spawn point columns in blocks along the top row: left, center, right.
    spawnColumns: [0, 6, 12],
    spawnIntervalRange: { min: 0.8, max: 3.0 },
  },

  powerups: {
    types: ['star', 'grenade', 'helmet', 'shovel', 'stopwatch', 'tank', 'pistol'],
    pistolWeight: 0.04, // must stay <= 0.05; classics split the rest evenly
    pickupPoints: 500,
    helmetDuration: 10,
    shovelDuration: 20,
    stopwatchDuration: 10,
    // 16 predefined drop locations, in blocks (col, row). Chosen to spread
    // across the field, away from spawn rows and the base ring.
    dropLocations: [
      [1, 2], [4, 2], [8, 2], [11, 2],
      [2, 4], [6, 4], [10, 4], [12, 4],
      [0, 6], [4, 6], [8, 6], [12, 6],
      [1, 9], [5, 9], [7, 9], [11, 9],
    ],
  },

  scoring: {
    extraLifeAt: 20000,
    coopKillLeaderBonus: 1000,
  },

  coop: {
    friendlyFireFreezeDuration: 1.5,
    lifeTransferMinDonorLives: 2,
  },

  ice: {
    slideDistancePx: 16, // ~half a block of momentum after input release
  },

  ai: {
    decisionInterval: 0.5,
    heavyReplanInterval: 2.0,
    minBaseAttackers: 1, // enforced when >= 3 enemies on field
    baseAttackerThreshold: 3,
  },

  stages: {
    count: 35,
    // Looped stages (36+) reuse their layout but take stage 35's
    // enemies roster and spawn interval.
  },

  palette: {
    playerYellow: '#e8b830',
    playerGreen: '#30a848', // P2 tint
    enemySilver: '#b8b8b8',
    brickRust: '#b04018',
    brickMortar: '#602808',
    steelGray: '#a0a0a0',
    steelHighlight: '#e0e0e0',
    waterBlue: '#2048c8',
    waterHighlight: '#4880e8',
    iceWhite: '#d0e8f0',
    treeGreen: '#188030',
    treeHighlight: '#40b850',
    uiGray: '#787878',
    uiDark: '#101010',
    alertRed: '#d82800',
    bonusFlash: '#d82800',
    frozenTint: '#4880e8',
    black: '#000000',
    white: '#ffffff',
  },

  input: {
    keyboard: {
      p1: {
        up: 'ArrowUp',
        down: 'ArrowDown',
        left: 'ArrowLeft',
        right: 'ArrowRight',
        fire: 'Space',
        pause: 'Escape',
        start: 'Enter',
      },
      p2: {
        up: 'KeyW',
        down: 'KeyS',
        left: 'KeyA',
        right: 'KeyD',
        fire: 'KeyF',
        pause: 'Escape',
        start: 'Enter',
      },
      mute: 'KeyM',
    },
    gamepad: {
      dpad: { up: 12, down: 13, left: 14, right: 15 },
      fire: 0,
      start: 9,
      stickDeadzone: 0.3,
    },
  },

  audio: {
    masterGain: 0.5,
  },

  juice: {
    shake: { tankExplosion: 2, baseHit: 5 },
    hitStopFrames: 2,
    rumble: {
      bulletConnect: { duration: 60, weak: 0.3, strong: 0 },
      playerDeath: { duration: 250, weak: 0.6, strong: 0.8 },
      baseHit: { duration: 400, weak: 0.8, strong: 1.0 },
    },
  },
});
