import { describe, it, expect, vi } from 'vitest';
import { createCoop, playerImpact } from '../src/systems/coop.js';
import { createPlayer } from '../src/entities/player.js';
import { createEventBus, createBulletSystem } from '../src/engine/bullets.js';
import { createGrid } from '../src/engine/grid.js';
import { createSession } from '../src/core/state.js';
import { createActionState } from '../src/input/actions.js';
import { CONFIG } from '../src/core/config.js';

const DT = 1 / 60;

function emptyLayout() {
  return Array.from({ length: 13 }, () => '.'.repeat(13));
}

function makeCoop() {
  const bus = createEventBus();
  const session = createSession(2);
  const actions = new Map();
  const players = [1, 2].map((id) => {
    const a = createActionState();
    actions.set(id, a);
    const p = createPlayer({ playerId: id, sessionPlayer: session.players[id - 1], actions: a });
    p.tank.state = 'alive';
    p.tank.spawnTimer = 0;
    p.tank.invulnTimer = 0;
    return p;
  });
  const onAllPlayersOut = vi.fn();
  const coop = createCoop({
    bus,
    session,
    players,
    actionsFor: (id) => actions.get(id),
    onAllPlayersOut,
  });
  const events = [];
  for (const t of ['friendlyFire', 'playerDeath', 'lifeTransfer']) {
    bus.on(t, (p) => events.push({ type: t, payload: p }));
  }
  return { bus, session, players, actions, coop, events, onAllPlayersOut };
}

describe('friendly fire', () => {
  it('P1 bullet hits P2: P2 frozen, not destroyed, no points', () => {
    const { bus, players, session, events } = makeCoop();
    const [p1, p2] = players;

    bus.emit('tankHit', {
      target: { rect: p2.tank.rect, ref: p2, side: 'player' },
      bullet: { side: 'player', ownerPlayerId: 1, owner: p1.tank },
    });

    expect(p2.tank.frozen).toBe(true);
    expect(p2.tank.frozenTimer).toBeCloseTo(CONFIG.coop.friendlyFireFreezeDuration);
    expect(p2.tank.state).toBe('alive');
    expect(session.players[1].lives).toBe(3);
    expect(session.players[0].score).toBe(0);
    expect(events.filter((e) => e.type === 'friendlyFire')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'playerDeath')).toHaveLength(0);
  });

  it('full pipeline: a real P1 bullet freezes P2 through the bullet system', () => {
    const { bus, players } = makeCoop();
    const [p1, p2] = players;
    const grid = createGrid(emptyLayout());
    const bullets = createBulletSystem({ grid, bus });
    p1.tank.rect.x = 64;
    p1.tank.rect.y = 96;
    p2.tank.rect.x = 256;
    p2.tank.rect.y = 96;

    bullets.spawn({
      x: 100, y: 108, dir: 'right', speed: 320, side: 'player',
      owner: p1.tank, ownerPlayerId: 1,
    });
    const targets = players.map((p) => ({
      rect: p.tank.rect, ref: p, side: 'player', impact: playerImpact(p),
    }));
    for (let i = 0; i < 60; i++) bullets.update(DT, { targets });
    expect(p2.tank.frozen).toBe(true);
    expect(p2.tank.state).toBe('alive');
  });
});

describe('enemy hits on players', () => {
  it('enemy bullet kills the player (tier reset, respawn)', () => {
    const { bus, players, session, events } = makeCoop();
    session.players[0].tier = 4;
    bus.emit('tankHit', {
      target: { rect: players[0].tank.rect, ref: players[0], side: 'player' },
      bullet: { side: 'enemy' },
    });
    expect(session.players[0].lives).toBe(2);
    expect(session.players[0].tier).toBe(1);
    expect(events.filter((e) => e.type === 'playerDeath')).toHaveLength(1);
  });

  it('fires onAllPlayersOut when the last player falls', () => {
    const { bus, players, session, onAllPlayersOut } = makeCoop();
    session.players[0].lives = 1;
    session.players[1].lives = 1;
    for (const p of players) {
      bus.emit('tankHit', {
        target: { rect: p.tank.rect, ref: p, side: 'player' },
        bullet: { side: 'enemy' },
      });
    }
    expect(onAllPlayersOut).toHaveBeenCalledTimes(1);
  });
});

describe('enemy cap', () => {
  it('6 with two players, 4 when P2 is out of the session', () => {
    const { coop, players, session } = makeCoop();
    expect(coop.currentCap()).toBe(6);
    session.players[1].lives = 0;
    players[1].tank.state = 'dead';
    expect(coop.currentCap()).toBe(4);
  });
});

describe('life transfer', () => {
  function killP2(setup) {
    setup.session.players[1].lives = 1;
    setup.bus.emit('tankHit', {
      target: { rect: setup.players[1].tank.rect, ref: setup.players[1], side: 'player' },
      bullet: { side: 'enemy' },
    });
    expect(setup.players[1].out).toBe(true);
  }

  it('decrements donor, revives recipient', () => {
    const s = makeCoop();
    killP2(s);
    s.session.players[0].lives = 3;

    s.actions.get(2).set('fire', true);
    s.actions.get(2).commit();
    s.coop.update(DT);

    expect(s.session.players[0].lives).toBe(2);
    expect(s.session.players[1].lives).toBe(1);
    expect(s.players[1].tank.state).toBe('spawning');
    expect(s.events.filter((e) => e.type === 'lifeTransfer')).toHaveLength(1);
  });

  it('refuses when the donor has only 1 life', () => {
    const s = makeCoop();
    killP2(s);
    s.session.players[0].lives = 1;

    s.actions.get(2).set('fire', true);
    s.actions.get(2).commit();
    s.coop.update(DT);

    expect(s.session.players[0].lives).toBe(1);
    expect(s.players[1].out).toBe(true);
  });
});

describe('HUD contract', () => {
  it('exposes both players in a stable shape', () => {
    const { coop, session } = makeCoop();
    session.players[0].score = 1200;
    session.players[1].tier = 3;
    expect(coop.hudData()).toEqual([
      { id: 1, lives: 3, score: 1200, tier: 1, out: false },
      { id: 2, lives: 3, score: 0, tier: 3, out: false },
    ]);
  });
});
