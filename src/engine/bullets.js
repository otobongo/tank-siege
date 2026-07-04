/**
 * Pooled bullets, swept movement, destruction resolution, event bus.
 *
 * Resolution order per bullet step (plan TS-008):
 *   bullet-vs-bullet cancel -> bullet-vs-tank -> bullet-vs-terrain
 *   (applyBulletDamage) -> bullet-vs-base (via terrain HIT.BASE) -> edge.
 * Opposing bullets are included as sweep targets, so two fast bullets
 * closing on each other cannot tunnel: each sweep covers its own
 * distance against the other's current position.
 *
 * Events emitted on the shared bus:
 *   brickHit     { x, y, dir }
 *   steelClang   { x, y, destroyed }
 *   tankHit      { target, bullet }   // damage decided by subscribers
 *   baseHit      { x, y }
 *   bulletCancel { x, y }
 * `tankDestroyed` is emitted by the systems that own HP (TS-011/016)
 * on this same bus; bullets.js only reports impacts.
 *
 * Public interface (owned by TS-008):
 *   createEventBus() -> { on(type, cb) -> off, emit(type, payload) }
 *   createBulletSystem({ grid, bus }) -> {
 *     spawn(request), update(dt, { targets }), clear(), bullets
 *   }
 *
 * A fire request (from player.js / enemy.js) is:
 *   { x, y, dir, speed, depth, destroySteel, owner, ownerPlayerId?, side }
 * A target is:
 *   { rect, ref, side, impact? }  // impact(): 'hit' | 'absorb' | 'ignore'
 */

import { CONFIG } from '../core/config.js';
import { sweepBullet, aabbIntersects } from '../engine/collision.js';
import { HIT } from './grid.js';

export function createEventBus() {
  const handlers = new Map();
  return {
    on(type, cb) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(cb);
      return () => handlers.get(type)?.delete(cb);
    },
    emit(type, payload) {
      const set = handlers.get(type);
      if (set) for (const cb of [...set]) cb(payload);
    },
  };
}

export function createBulletSystem({ grid, bus }) {
  /** @type {Array<object>} live bullets (order = spawn order) */
  const bullets = [];

  function terminate(bullet) {
    bullet.dead = true;
    bullet.owner?.releaseBullet?.();
    const i = bullets.indexOf(bullet);
    if (i !== -1) bullets.splice(i, 1);
  }

  function center(rect) {
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  }

  return {
    bullets,

    /** @param {object} request fire request (see module docs) */
    spawn(request) {
      const size = CONFIG.bullet.sizePx;
      bullets.push({
        rect: { x: request.x, y: request.y, w: size, h: size },
        dir: request.dir,
        speed: request.speed,
        depth: request.depth ?? 1,
        destroySteel: request.destroySteel ?? false,
        owner: request.owner ?? null,
        ownerPlayerId: request.ownerPlayerId ?? null,
        side: request.side ?? (request.ownerPlayerId ? 'player' : 'enemy'),
        fraction: 0,
        dead: false,
      });
    },

    /** Drop all bullets without events (stage transitions). */
    clear() {
      for (const b of [...bullets]) terminate(b);
    },

    /**
     * @param {number} dt seconds
     * @param {{ targets?: Array<{rect, ref, side, impact?}> }} world
     *   tank targets; bullets.js adds opposing bullets itself
     */
    update(dt, { targets = [] } = {}) {
      for (const bullet of [...bullets]) {
        if (bullet.dead) continue;

        bullet.fraction += bullet.speed * dt;
        const dist = Math.floor(bullet.fraction);
        bullet.fraction -= dist;
        if (dist <= 0) continue;

        // Sweep targets: opposing bullets first (cancel has priority),
        // then tanks this bullet may hit.
        // sweepBullet reports hit.ref verbatim, so wrap each entry
        // with its kind for dispatch below.
        const sweepTargets = [];
        for (const other of bullets) {
          if (other === bullet || other.dead) continue;
          if (other.side === bullet.side) continue; // same side: no interaction
          sweepTargets.push({ rect: other.rect, ref: { kind: 'bullet', entry: other } });
        }
        for (const t of targets) {
          if (t.ref === bullet.owner) continue; // never hit yourself
          if (bullet.side === 'enemy' && t.side === 'enemy') continue; // pass through
          if (t.impact?.() === 'ignore') continue; // e.g. spawn telegraph
          sweepTargets.push({ rect: t.rect, ref: { kind: 'tank', entry: t } });
        }

        const result = sweepBullet(bullet.rect, bullet.dir, dist, {
          solidAt: (x, y) => grid.isSolidForBullet(x, y),
          targets: sweepTargets,
        });
        bullet.rect.x = result.x;
        bullet.rect.y = result.y;

        if (!result.hit) continue;

        if (result.hit.type === 'entity') {
          const { kind, entry } = result.hit.ref;
          if (kind === 'bullet') {
            const c = center(bullet.rect);
            bus.emit('bulletCancel', { x: c.x, y: c.y });
            terminate(entry);
            terminate(bullet);
          } else {
            // Tank (or any entity target). 'absorb' consumes the bullet
            // with no damage event (helmet shield); 'hit' reports impact.
            if (entry.impact?.() !== 'absorb') {
              bus.emit('tankHit', { target: entry, bullet });
            }
            terminate(bullet);
          }
          continue;
        }

        // Terrain path: brick, steel, base, or edge.
        const outcome = grid.applyBulletDamage(
          result.hit.x,
          result.hit.y,
          bullet.dir,
          bullet.depth,
          { destroySteel: bullet.destroySteel }
        );
        const c = center(bullet.rect);
        switch (outcome) {
          case HIT.BRICK:
            bus.emit('brickHit', { x: c.x, y: c.y, dir: bullet.dir });
            break;
          case HIT.STEEL:
            bus.emit('steelClang', { x: c.x, y: c.y, destroyed: bullet.destroySteel });
            break;
          case HIT.BASE:
            bus.emit('baseHit', { x: result.hit.x, y: result.hit.y });
            break;
          default:
            break; // edge or already-cleared terrain: silent
        }
        terminate(bullet);
      }
    },
  };
}

export { aabbIntersects };
