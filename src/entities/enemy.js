/**
 * Enemy tank types: basic, fast, power, heavy.
 *
 * Stats come from CONFIG.tank.enemy. A heavy has 4 HP with per-HP tint
 * stepping (renderer reads hp/maxHp) and a hit-flash timer. A
 * bonus-flagged tank flashes red until its FIRST hit, which emits
 * `powerupDrop` exactly once and stops the flashing - even on a heavy
 * that survives the hit.
 *
 * Lifecycle: spawns in 'spawning' (the sparkle telegraph; bullets
 * ignore it, it neither moves nor collides), then 'alive'. Stopwatch
 * freeze (freeze(duration)) blocks movement AND fire but the tank can
 * still be destroyed.
 *
 * Death emits `tankDestroyed` { enemy, type, points, byPlayerId, x, y }
 * so scoring lands on the killer (event carries shooter identity).
 *
 * Public interface (owned by TS-011):
 *   createEnemy({ type, x, y, bonus, bus }) -> enemy
 *   enemy.takeHit({ byPlayerId }) -> 'destroyed' | 'damaged'
 *   enemy.impact() -> 'hit' | 'ignore'   (bullet target contract)
 *   enemy.freeze(seconds), enemy.frozenByStopwatch
 */

import { CONFIG } from '../core/config.js';
import { createTank } from './tank.js';

const HIT_FLASH_DURATION = 0.1;

export function createEnemy({ type, x, y, bonus = false, bus }) {
  const stats = CONFIG.tank.enemy[type];
  if (!stats) throw new Error(`unknown enemy type: ${type}`);

  const tank = createTank({
    x,
    y,
    facing: 'down',
    spawnDuration: CONFIG.tank.enemy.spawnTelegraphDuration,
  });

  const enemy = {
    kind: 'enemy',
    type,
    tank,
    stats,
    hp: stats.hp,
    maxHp: stats.hp,
    bonus, // flashing red while true
    hitFlashTimer: 0,
    stopwatchTimer: 0,
    dead: false,

    get rect() {
      return tank.rect;
    },
    get frozenByStopwatch() {
      return enemy.stopwatchTimer > 0;
    },

    /** Bullet target contract: telegraphing tanks are not hittable. */
    impact() {
      return tank.state === 'spawning' || enemy.dead ? 'ignore' : 'hit';
    },

    /** Stopwatch power-up: no movement, no fire; still destroyable. */
    freeze(seconds) {
      enemy.stopwatchTimer = Math.max(enemy.stopwatchTimer, seconds);
    },

    /**
     * Apply one bullet hit.
     * @param {{ byPlayerId?: number }} source shooter identity
     * @returns {'destroyed'|'damaged'}
     */
    takeHit({ byPlayerId = null } = {}) {
      if (enemy.dead) return 'damaged';

      if (enemy.bonus) {
        // First hit triggers the drop and stops the flashing, even if
        // the tank (a heavy) survives.
        enemy.bonus = false;
        bus.emit('powerupDrop', { source: enemy, byPlayerId });
      }

      enemy.hp--;
      enemy.hitFlashTimer = HIT_FLASH_DURATION;

      if (enemy.hp <= 0) {
        enemy.dead = true;
        tank.state = 'dead';
        bus.emit('tankDestroyed', {
          enemy,
          type,
          points: stats.points,
          byPlayerId,
          x: tank.rect.x + tank.rect.w / 2,
          y: tank.rect.y + tank.rect.h / 2,
        });
        return 'destroyed';
      }
      return 'damaged';
    },

    /**
     * One tick of passive state (timers). Movement and fire intent
     * come from the AI controller (TS-012), which must skip frozen
     * and spawning tanks.
     * @param {number} dt
     */
    update(dt) {
      tank.tickTimers(dt);
      if (enemy.hitFlashTimer > 0) enemy.hitFlashTimer -= dt;
      if (enemy.stopwatchTimer > 0) enemy.stopwatchTimer -= dt;
    },

    /**
     * Fire helper for the AI: returns a bullet request or null.
     * Enemies keep at most one bullet in flight.
     */
    tryFire() {
      if (enemy.frozenByStopwatch || tank.state !== 'alive') return null;
      if (!tank.canFire(CONFIG.tank.enemy.bulletCap)) return null;
      tank.noteFired();
      const m = tank.muzzle();
      return {
        x: m.x,
        y: m.y,
        dir: tank.facing,
        speed: stats.bulletSpeed,
        depth: 1,
        destroySteel: false,
        owner: tank,
        side: 'enemy',
      };
    },

    /** Movement helper for the AI. No-op while frozen or spawning. */
    drive(dir, dt, isBlocked, env = {}) {
      if (enemy.frozenByStopwatch) return 0;
      return tank.drive(dir, stats.speed, dt, isBlocked, env);
    },
  };

  return enemy;
}
