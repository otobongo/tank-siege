/**
 * 20-slot enemy spawn queue, bonus flags, spawn points.
 *
 * Consumes stage.enemies (ordered!) as a queue. The 4th, 11th, and
 * 18th tanks (0-based indices 3/10/17) are bonus-flagged. Three spawn
 * points along the top row (left corner, center, right corner) are
 * cycled in order; a spawn is DEFERRED while its point is blocked or
 * the concurrent cap is reached - queue order is never skipped and
 * the point does not advance until the spawn succeeds.
 *
 * The spawner owns queue pacing only. It emits `enemySpawn` on the bus
 * and calls onSpawn(desc); the enemy system materializes the tank and
 * must call noteEnemyRemoved() when one leaves the field (death or
 * grenade). The telegraph animation is the enemy's own state (TS-011).
 *
 * Public interface (owned by TS-010):
 *   ENEMY_TYPE_BY_CHAR
 *   spawnPointRect(pointIndex) -> { x, y, w, h }
 *   createSpawner({ stage, playerCount, bus, isBlockedAt, onSpawn }) -> {
 *     update(dt), noteEnemyRemoved(),
 *     remaining, onFieldCount, allDefeated
 *   }
 */

import { CONFIG } from '../core/config.js';

export const ENEMY_TYPE_BY_CHAR = Object.freeze({
  b: 'basic',
  f: 'fast',
  m: 'power',
  h: 'heavy',
});

/** Field rect a tank occupies at spawn point 0/1/2 (left/center/right). */
export function spawnPointRect(pointIndex) {
  const col = CONFIG.spawner.spawnColumns[pointIndex];
  return {
    x: col * CONFIG.grid.blockPx,
    y: 0,
    w: CONFIG.tank.sizePx,
    h: CONFIG.tank.sizePx,
  };
}

/**
 * @param {{ stage: { enemies: string[], spawnInterval: number },
 *           playerCount: 1|2,
 *           bus: object,
 *           isBlockedAt: (rect) => boolean,
 *           onSpawn: (desc) => void }} opts
 *   desc = { type, bonus, x, y, index, pointIndex }
 */
export function createSpawner({ stage, playerCount, bus, isBlockedAt, onSpawn }) {
  const queue = stage.enemies.map((ch, index) => {
    const type = ENEMY_TYPE_BY_CHAR[ch];
    if (!type) throw new Error(`unknown enemy char '${ch}' at ${index}`);
    return { type, index, bonus: CONFIG.spawner.bonusIndices.includes(index) };
  });
  if (queue.length !== CONFIG.spawner.enemiesPerStage) {
    throw new Error(`stage must queue exactly ${CONFIG.spawner.enemiesPerStage} enemies`);
  }

  const cap =
    playerCount === 2 ? CONFIG.spawner.maxOnField.twoPlayer : CONFIG.spawner.maxOnField.onePlayer;

  let cursor = 0; // next queue entry to spawn
  let pointIndex = 0; // spawn point to use next (advances on success)
  let timer = 0; // counts down to the next spawn ATTEMPT
  let onField = 0;

  return {
    /** Enemies not yet spawned (HUD icons deplete on spawn). */
    get remaining() {
      return queue.length - cursor;
    },
    get onFieldCount() {
      return onField;
    },
    /** Stage-clear condition: queue empty AND field empty. */
    get allDefeated() {
      return cursor >= queue.length && onField === 0;
    },

    /** Call when an enemy leaves the field (destroyed or wiped). */
    noteEnemyRemoved() {
      onField = Math.max(0, onField - 1);
    },

    update(dt) {
      if (cursor >= queue.length) return;
      timer -= dt;
      if (timer > 0) return;

      // Attempt due: defer (retry every tick) while capped or blocked.
      if (onField >= cap) return;
      const rect = spawnPointRect(pointIndex);
      if (isBlockedAt(rect)) return;

      const entry = queue[cursor++];
      onField++;
      const desc = {
        type: entry.type,
        bonus: entry.bonus,
        index: entry.index,
        x: rect.x,
        y: rect.y,
        pointIndex,
      };
      pointIndex = (pointIndex + 1) % CONFIG.spawner.spawnColumns.length;
      timer = stage.spawnInterval;
      bus.emit('enemySpawn', desc);
      onSpawn?.(desc);
    },
  };
}
