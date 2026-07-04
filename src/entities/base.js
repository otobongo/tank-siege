/**
 * Base (eagle) entity and shield ring hooks.
 *
 * The eagle's terrain footprint and the brick ring live in grid.js;
 * this entity owns the intact/destroyed STATE and the game-over
 * trigger. Any `baseHit` on the bus (from any bullet, including a
 * player's own) destroys it exactly once, emits `baseDestroyed`, and
 * invokes onDestroyed so the session flow (TS-014) can enter GAME_OVER
 * on its next tick, bypassing lives.
 *
 * The Shovel's 20s timer is owned by the power-up system (TS-013);
 * fortify/revert/repair here just delegate to the grid.
 *
 * Public interface (owned by TS-009):
 *   createBase({ grid, bus, onDestroyed }) -> {
 *     rect, destroyed, fortify(), revert(), repair(), dispose()
 *   }
 */

export function createBase({ grid, bus, onDestroyed }) {
  const base = {
    rect: grid.baseRect,
    destroyed: false,

    /** Shovel pickup: ring turns to steel. */
    fortify() {
      grid.fortifyBase(true);
    },
    /** Shovel expiry: ring reverts to repaired brick. */
    revert() {
      grid.fortifyBase(false);
      grid.repairBaseRing();
    },
    repair() {
      grid.repairBaseRing();
    },
    dispose() {
      offBaseHit();
    },
  };

  const offBaseHit = bus.on('baseHit', ({ x, y }) => {
    if (base.destroyed) return;
    base.destroyed = true;
    bus.emit('baseDestroyed', {
      x: base.rect.x + base.rect.w / 2,
      y: base.rect.y + base.rect.h / 2,
      hitX: x,
      hitY: y,
    });
    onDestroyed?.();
  });

  return base;
}
