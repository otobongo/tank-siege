/**
 * Power-up drop logic, effects, and timers.
 *
 * Subscribes to `powerupDrop` (emitted by a bonus tank's first hit,
 * TS-011). Rules (plan section 2 + TS-013):
 *   - Drop location: seeded-random pick from the 16 predefined block
 *     locations, skipping any occluded by water or steel.
 *   - Only ONE power-up on the field; a new drop replaces the old one.
 *   - Type weights: the six classics split evenly; Pistol <= 5%.
 *   - Pickup: +500 points to the collector, effect applies to the
 *     collecting player; Grenade/Stopwatch/Shovel are global.
 *   - Timers owned here: the Shovel's 20s fortify window (helmet and
 *     stopwatch durations are applied to their targets directly).
 *
 * Events emitted: powerupSpawned { type, x, y },
 *   powerupPickup { type, playerId }, powerupExpired { type },
 *   fieldWiped { count } (grenade, no points).
 *
 * Public interface (owned by TS-013):
 *   createPowerupSystem({ grid, bus, rng, base, players,
 *                         getFieldEnemies }) -> {
 *     current, update(dt), dispose()
 *   }
 */

import { CONFIG } from '../core/config.js';
import { TERRAIN } from '../engine/grid.js';
import { aabbIntersects } from '../engine/collision.js';
import { createPowerup } from '../entities/powerup.js';

const PU = CONFIG.powerups;

export function createPowerupSystem({ grid, bus, rng, base, players, getFieldEnemies }) {
  let current = null;
  let shovelTimer = 0;

  /** A drop location is valid unless water or steel occludes it. */
  function validLocations() {
    return PU.dropLocations.filter(([col, row]) => {
      for (let hr = row * 2; hr < row * 2 + 2; hr++) {
        for (let hc = col * 2; hc < col * 2 + 2; hc++) {
          const t = grid.halfCellAt(hc, hr);
          if (t === TERRAIN.WATER || t === TERRAIN.STEEL || t === TERRAIN.BASE) return false;
        }
      }
      return true;
    });
  }

  function pickType() {
    if (rng() < PU.pistolWeight) return 'pistol';
    const classics = PU.types.filter((t) => t !== 'pistol');
    return classics[Math.floor(rng() * classics.length)];
  }

  function drop() {
    const spots = validLocations();
    if (spots.length === 0) return; // pathological stage; skip the drop
    const [col, row] = spots[Math.floor(rng() * spots.length)];
    // Single-item rule: replacing is implicit.
    current = createPowerup({ type: pickType(), col, row });
    bus.emit('powerupSpawned', {
      type: current.type,
      x: current.rect.x,
      y: current.rect.y,
    });
  }

  function apply(type, player) {
    switch (type) {
      case 'star':
        player.upgradeTier(); // tier 4 stays tier 4
        break;
      case 'pistol':
        player.setTier(4);
        break;
      case 'tank':
        player.session.lives++;
        break;
      case 'helmet':
        player.tank.invulnTimer = PU.helmetDuration;
        break;
      case 'grenade': {
        // Field wipe: no points, spawn queue untouched.
        const field = getFieldEnemies().filter((e) => !e.dead);
        for (const enemy of field) wipe(enemy);
        bus.emit('fieldWiped', { count: field.length });
        break;
      }
      case 'stopwatch':
        for (const enemy of getFieldEnemies()) enemy.freeze(PU.stopwatchDuration);
        break;
      case 'shovel':
        base.fortify();
        shovelTimer = PU.shovelDuration;
        break;
    }
  }

  /** Grenade kill: silent removal, no scoring events. */
  function wipe(enemy) {
    enemy.dead = true;
    enemy.tank.state = 'dead';
  }

  const offDrop = bus.on('powerupDrop', drop);

  return {
    get current() {
      return current;
    },

    update(dt) {
      if (current) {
        current.age += dt;
        for (const player of players) {
          if (player.tank.state !== 'alive') continue;
          if (aabbIntersects(player.tank.rect, current.rect)) {
            const { type } = current;
            current = null;
            player.session.score += PU.pickupPoints;
            apply(type, player);
            bus.emit('powerupPickup', { type, playerId: player.id });
            break;
          }
        }
      }

      if (shovelTimer > 0) {
        shovelTimer -= dt;
        if (shovelTimer <= 0) {
          base.revert(); // steel -> repaired pristine brick
          bus.emit('powerupExpired', { type: 'shovel' });
        }
      }
    },

    dispose() {
      offDrop();
    },
  };
}
