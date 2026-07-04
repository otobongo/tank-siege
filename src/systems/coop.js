/**
 * Two-player co-op: P2 lifecycle, friendly fire, kill attribution,
 * life transfer, HUD contract.
 *
 * Kill attribution is already event-borne (tankDestroyed carries
 * byPlayerId -> progression, TS-014). This module owns what happens
 * when a PLAYER tank is struck:
 *   - by another player's bullet: the victim is NOT destroyed; they
 *     freeze ~1.5s (can still rotate and shoot), no points to anyone
 *   - by an enemy bullet: normal death handling (tier reset, respawn
 *     or out); when every player is out, onAllPlayersOut fires
 *
 * Life transfer (the original's emergency-transfer spirit): a player
 * at 0 lives pressing FIRE borrows a life from a partner holding >= 2.
 *
 * Enemy cap: 6 while two players are in the session, 4 otherwise
 * (currentCap(), consumed when building the spawner).
 *
 * Public interface (owned by TS-016):
 *   playerImpact(player) -> bullet target `impact` closure
 *   createCoop({ bus, players, actionsFor, onAllPlayersOut }) -> {
 *     update(dt), currentCap(), hudData(), dispose()
 *   }
 */

import { CONFIG } from '../core/config.js';

/**
 * Bullet-target contract for a player tank: shimmer/helmet absorb the
 * bullet, a dead or telegraphing tank is passed through.
 */
export function playerImpact(player) {
  return () => {
    if (player.tank.state !== 'alive') return 'ignore';
    if (player.tank.invulnTimer > 0) return 'absorb';
    return 'hit';
  };
}

/**
 * @param {{ bus: object,
 *           players: Array<object>,           // createPlayer objects
 *           actionsFor: (playerId) => object, // ActionState per player
 *           onAllPlayersOut?: () => void }} opts
 */
export function createCoop({ bus, players, actionsFor, onAllPlayersOut }) {
  function checkAllOut() {
    if (players.every((p) => p.out)) onAllPlayersOut?.();
  }

  const offHit = bus.on('tankHit', ({ target, bullet }) => {
    const victim = players.find((p) => p === target.ref);
    if (!victim) return; // enemy hits are the enemy system's business

    if (bullet.side === 'player') {
      // Friendly fire: freeze, never destroy, no points (no
      // tankDestroyed is emitted, so no score can land).
      victim.tank.frozenTimer = CONFIG.coop.friendlyFireFreezeDuration;
      bus.emit('friendlyFire', {
        victimId: victim.id,
        shooterId: bullet.ownerPlayerId,
      });
      return;
    }

    const outcome = victim.die();
    bus.emit('playerDeath', { playerId: victim.id, outcome });
    if (outcome === 'out') checkAllOut();
  });

  return {
    /** Max simultaneous enemies given who is still in the session. */
    currentCap() {
      const active = players.filter((p) => !p.out).length;
      return active >= 2 ? CONFIG.spawner.maxOnField.twoPlayer : CONFIG.spawner.maxOnField.onePlayer;
    },

    /** HUD contract: both players' data in one stable shape. */
    hudData() {
      return players.map((p) => ({
        id: p.id,
        lives: p.session.lives,
        score: p.session.score,
        tier: p.session.tier,
        out: p.out,
      }));
    },

    update(_dt) {
      // Life transfer: dead player presses fire, partner donates.
      for (const dead of players) {
        if (!dead.out) continue;
        if (!actionsFor(dead.id)?.justPressed('fire')) continue;
        const donor = players.find(
          (p) => p !== dead && p.session.lives >= CONFIG.coop.lifeTransferMinDonorLives
        );
        if (!donor) continue;
        donor.session.lives--;
        dead.session.lives = 1;
        dead.respawn();
        bus.emit('lifeTransfer', { from: donor.id, to: dead.id });
      }
    },

    dispose() {
      offHit();
    },
  };
}
