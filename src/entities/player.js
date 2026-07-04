/**
 * Player tank: tiers, spawn shimmer, respawn.
 *
 * Reads an assigned ActionState (input/actions.js); never touches
 * hardware. Tier data (speed, bullet speed, bullet cap, brick depth,
 * steel destruction) comes from CONFIG.tank.player per the Star ladder.
 *
 * Public interface (owned by TS-007):
 *   playerSpawnPoint(playerId) -> { x, y }
 *   createPlayer({ playerId, sessionPlayer, actions }) -> player
 *
 * player.update(dt, world) drives movement and returns a fire request
 * ({ x, y, dir, speed, depth, destroySteel, owner }) or null; the
 *  bullet system (TS-008) consumes it.
 */

import { CONFIG } from '../core/config.js';
import { createTank } from './tank.js';

const P = CONFIG.tank.player;

/** Fixed spawn positions: P1 bottom-left of base, P2 bottom-right. */
export function playerSpawnPoint(playerId) {
  const block = playerId === 1 ? P.p1SpawnBlock : P.p2SpawnBlock;
  return {
    x: block * CONFIG.grid.blockPx,
    y: (CONFIG.grid.blocks - 1) * CONFIG.grid.blockPx,
  };
}

/**
 * @param {{ playerId: 1|2,
 *           sessionPlayer: object,  // session.players[i] from state.js
 *           actions: object }} opts // ActionState from actions.js
 */
export function createPlayer({ playerId, sessionPlayer, actions }) {
  const spawn = playerSpawnPoint(playerId);
  const tank = createTank({
    x: spawn.x,
    y: spawn.y,
    facing: 'up',
    fireCooldown: P.fireCooldown,
    spawnDuration: P.spawnAnimDuration,
  });
  tank.invulnTimer = P.spawnInvulnerability;

  const player = {
    id: playerId,
    tank,
    session: sessionPlayer,

    get tier() {
      return player.session.tier;
    },
    get invulnerable() {
      return tank.invulnTimer > 0;
    },
    get lives() {
      return player.session.lives;
    },
    /** True while the player has no tank on field and no lives left. */
    get out() {
      return tank.state === 'dead' && player.session.lives <= 0;
    },

    /** Star power-up / Pistol hooks (TS-013). */
    upgradeTier() {
      player.session.tier = Math.min(4, player.session.tier + 1);
    },
    setTier(tier) {
      player.session.tier = tier;
    },

    /**
     * Kill the player: tier resets, a life is spent, and the tank
     * respawns at its fixed point if lives remain.
     * @returns {'respawn'|'out'}
     */
    die() {
      player.session.tier = 1;
      player.session.lives--;
      if (player.session.lives > 0) {
        player.respawn();
        return 'respawn';
      }
      tank.state = 'dead';
      return 'out';
    },

    respawn() {
      tank.rect.x = spawn.x;
      tank.rect.y = spawn.y;
      tank.facing = 'up';
      tank.state = 'spawning';
      tank.spawnTimer = P.spawnAnimDuration;
      tank.invulnTimer = P.spawnInvulnerability;
      tank.frozenTimer = 0;
      tank.slide.cancel();
      tank.bulletsInFlight = 0;
      tank.cooldownTimer = 0;
    },

    /**
     * One simulation tick.
     * @param {number} dt seconds
     * @param {{ grid: object, blockers?: Array<{x,y,w,h}> }} world
     *   blockers: rects of other tanks (this tank excluded)
     * @returns {object|null} fire request for the bullet system
     */
    update(dt, { grid, blockers = [] } = {}) {
      tank.tickTimers(dt);
      if (tank.state === 'dead') return null;

      const isBlocked = (rect) => {
        if (grid.isSolidForTank(rect)) return true;
        return blockers.some(
          (b) => rect.x < b.x + b.w && rect.x + rect.w > b.x && rect.y < b.y + b.h && rect.y + rect.h > b.y
        );
      };

      tank.drive(actions.direction, P.speedByTier[player.tier], dt, isBlocked, {
        onIce: grid.isIce(tank.rect),
      });

      // Fire on the press edge only (original cadence: tap to shoot).
      // Friendly-fire freeze blocks movement, not the trigger.
      if (actions.justPressed('fire') && tank.canFire(P.bulletCapByTier[player.tier])) {
        tank.noteFired();
        const m = tank.muzzle();
        return {
          x: m.x,
          y: m.y,
          dir: tank.facing,
          speed: P.bulletSpeedByTier[player.tier],
          depth: P.brickDepthByTier[player.tier],
          destroySteel: player.tier >= P.steelDestroyTier,
          owner: tank,
          ownerPlayerId: playerId,
        };
      }
      return null;
    },
  };

  return player;
}
