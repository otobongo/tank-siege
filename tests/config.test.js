import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/core/config.js';

/** Walk every nested object and assert it is frozen. */
function assertDeepFrozen(obj, path = 'CONFIG') {
  expect(Object.isFrozen(obj), `${path} should be frozen`).toBe(true);
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      assertDeepFrozen(value, `${path}.${key}`);
    }
  }
}

describe('CONFIG', () => {
  it('is deeply frozen', () => {
    assertDeepFrozen(CONFIG);
  });

  it('rejects mutation attempts', () => {
    expect(() => {
      'use strict';
      CONFIG.grid.blocks = 99;
    }).toThrow();
    expect(() => {
      'use strict';
      CONFIG.powerups.dropLocations[0][0] = 99;
    }).toThrow();
  });

  it('encodes the section 2 ground truth', () => {
    expect(CONFIG.grid.blocks).toBe(13);
    expect(CONFIG.grid.halfCells).toBe(26);
    expect(CONFIG.grid.quarterCells).toBe(52);
    expect(CONFIG.canvas.width).toBe(544);
    expect(CONFIG.canvas.height).toBe(416);
    expect(CONFIG.spawner.enemiesPerStage).toBe(20);
    expect(CONFIG.spawner.bonusIndices).toEqual([3, 10, 17]);
    expect(CONFIG.spawner.maxOnField).toEqual({ onePlayer: 4, twoPlayer: 6 });
    expect(CONFIG.tank.player.bulletCapByTier).toEqual([null, 1, 1, 2, 2]);
    expect(CONFIG.tank.enemy.heavy.hp).toBe(4);
    expect(CONFIG.powerups.dropLocations).toHaveLength(16);
    expect(CONFIG.powerups.pistolWeight).toBeLessThanOrEqual(0.05);
    expect(CONFIG.powerups.types).toHaveLength(7);
    expect(CONFIG.scoring.extraLifeAt).toBe(20000);
  });
});
