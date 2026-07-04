/**
 * Shared tank base: kinematics, facing, fire cooldown, states.
 *
 * A tank is 2x2 half-cells (32px). Movement is 4-directional and
 * axis-locked; 90-degree turns snap the perpendicular coordinate to
 * the nearest 8px lane. Sub-pixel speed remainders are banked so slow
 * tanks still cover exact distances over time.
 *
 * States: 'spawning' (telegraph/shimmer, no movement, no collision for
 * enemies), 'alive', 'dead'. frozenTimer > 0 blocks MOVEMENT only;
 * whether fire is also blocked is the owner's rule (friendly-fire
 * victims may shoot, stopwatch-frozen enemies may not - TS-011/016).
 *
 * Public interface (owned by TS-007):
 *   createTank(opts) -> tank (see below)
 */

import { CONFIG } from '../core/config.js';
import { moveRect, snapToLane, createIceSlide, DIR_AXIS } from '../engine/collision.js';

/**
 * @param {{ x: number, y: number, facing?: string,
 *           fireCooldown?: number, spawnDuration?: number }} opts
 */
export function createTank({
  x,
  y,
  facing = 'up',
  fireCooldown = CONFIG.tank.player.fireCooldown,
  spawnDuration = 0,
}) {
  const size = CONFIG.tank.sizePx;

  const tank = {
    rect: { x, y, w: size, h: size },
    facing,
    state: spawnDuration > 0 ? 'spawning' : 'alive',
    spawnTimer: spawnDuration,
    invulnTimer: 0,
    frozenTimer: 0,
    moving: false, // renderer: tread animation + audio hum
    slide: createIceSlide(),

    // Fire bookkeeping. The bullet system calls releaseBullet() when a
    // bullet owned by this tank terminates for any reason.
    bulletsInFlight: 0,
    cooldownTimer: 0,

    get alive() {
      return tank.state === 'alive';
    },
    get frozen() {
      return tank.frozenTimer > 0;
    },

    /** Advance timers; call once per tick before movement. */
    tickTimers(dt) {
      if (tank.state === 'spawning') {
        tank.spawnTimer -= dt;
        if (tank.spawnTimer <= 0) tank.state = 'alive';
      }
      if (tank.invulnTimer > 0) tank.invulnTimer -= dt;
      if (tank.frozenTimer > 0) tank.frozenTimer -= dt;
      if (tank.cooldownTimer > 0) tank.cooldownTimer -= dt;
    },

    /**
     * Face a direction. A 90-degree turn snaps the coordinate on the
     * OLD travel axis to the nearest lane so corridors stay traversable.
     */
    setFacing(dir) {
      if (dir === tank.facing) return;
      const turning90 = DIR_AXIS[dir] !== DIR_AXIS[tank.facing];
      if (turning90) {
        if (DIR_AXIS[dir] === 'y') {
          tank.rect.x = snapToLane(tank.rect.x);
        } else {
          tank.rect.y = snapToLane(tank.rect.y);
        }
      }
      tank.facing = dir;
      tank.slide.cancel(); // steering on ice redirects momentum
    },

    _moveFraction: 0,

    /**
     * Drive the tank for one tick.
     *
     * @param {string|null} inputDir desired direction or null for idle
     * @param {number} speed px/s
     * @param {number} dt seconds
     * @param {(rect) => boolean} isBlocked terrain + entity test
     * @param {{ onIce?: boolean }} [env]
     * @returns {number} pixels actually moved
     */
    drive(inputDir, speed, dt, isBlocked, { onIce = false } = {}) {
      if (tank.state !== 'alive') {
        tank.moving = false;
        return 0;
      }
      if (tank.frozen) {
        // Frozen tanks may still rotate (no lane-snap teleport) and
        // shoot; they just cannot move.
        if (inputDir) tank.facing = inputDir;
        tank.moving = false;
        return 0;
      }

      let moved = 0;

      if (inputDir) {
        tank.setFacing(inputDir);
        tank._moveFraction += speed * dt;
        const dist = Math.floor(tank._moveFraction);
        tank._moveFraction -= dist;
        const r = moveRect(tank.rect, tank.facing, dist, isBlocked);
        moved = r.moved;
        tank.rect.x = r.x;
        tank.rect.y = r.y;
        // Any active input on ice re-arms the slide for release.
        if (onIce) tank.slide.begin(tank.facing);
        else tank.slide.cancel();
      } else if (tank.slide.active) {
        // Momentum carries ~half a block after release on ice.
        const dist = tank.slide.step(speed, dt);
        const r = moveRect(tank.rect, tank.slide.dir, dist, isBlocked);
        moved = r.moved;
        tank.rect.x = r.x;
        tank.rect.y = r.y;
        if (r.moved < dist) tank.slide.cancel(); // wall kills momentum
      } else {
        tank._moveFraction = 0;
      }

      tank.moving = moved > 0;
      return moved;
    },

    /** @param {number} cap max bullets this tank may have in flight */
    canFire(cap) {
      return tank.state === 'alive' && tank.cooldownTimer <= 0 && tank.bulletsInFlight < cap;
    },

    /** Record a shot; the bullet system owns the bullet from here. */
    noteFired() {
      tank.bulletsInFlight++;
      tank.cooldownTimer = fireCooldown;
    },

    /** Called by the bullet system when an owned bullet terminates. */
    releaseBullet() {
      tank.bulletsInFlight = Math.max(0, tank.bulletsInFlight - 1);
    },

    /** Bullet muzzle origin: centered on the leading face. */
    muzzle() {
      const b = CONFIG.bullet.sizePx;
      const { x, y, w, h } = tank.rect;
      switch (tank.facing) {
        case 'up':
          return { x: x + w / 2 - b / 2, y: y - b };
        case 'down':
          return { x: x + w / 2 - b / 2, y: y + h };
        case 'left':
          return { x: x - b, y: y + h / 2 - b / 2 };
        case 'right':
          return { x: x + w, y: y + h / 2 - b / 2 };
      }
    },
  };

  return tank;
}
