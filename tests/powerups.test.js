import { describe, it, expect } from 'vitest';
import { createPowerupSystem } from '../src/systems/powerups.js';
import { createBase } from '../src/entities/base.js';
import { createEnemy } from '../src/entities/enemy.js';
import { createPlayer } from '../src/entities/player.js';
import { createEventBus } from '../src/engine/bullets.js';
import { createGrid, TERRAIN } from '../src/engine/grid.js';
import { createSession } from '../src/core/state.js';
import { createActionState } from '../src/input/actions.js';
import { createRng } from '../src/ai/ai.js';
import { CONFIG } from '../src/core/config.js';

const DT = 1 / 60;

function emptyLayout() {
  return Array.from({ length: 13 }, () => '.'.repeat(13));
}

function makeSetup({ seed = 1, layoutRows = emptyLayout() } = {}) {
  const grid = createGrid(layoutRows);
  const bus = createEventBus();
  const session = createSession(2);
  const players = [1, 2].map((id) =>
    createPlayer({ playerId: id, sessionPlayer: session.players[id - 1], actions: createActionState() })
  );
  for (const p of players) {
    p.tank.state = 'alive';
    p.tank.spawnTimer = 0;
    p.tank.invulnTimer = 0;
  }
  const base = createBase({ grid, bus, onDestroyed: null });
  const enemies = [];
  const system = createPowerupSystem({
    grid,
    bus,
    rng: createRng(seed),
    base,
    players,
    getFieldEnemies: () => enemies,
  });
  const events = [];
  for (const t of ['powerupSpawned', 'powerupPickup', 'powerupExpired', 'fieldWiped', 'tankDestroyed']) {
    bus.on(t, (p) => events.push({ type: t, payload: p }));
  }
  return { grid, bus, session, players, base, enemies, system, events };
}

function collect(setup, playerIndex = 0) {
  const p = setup.players[playerIndex];
  const pu = setup.system.current;
  p.tank.rect.x = pu.rect.x;
  p.tank.rect.y = pu.rect.y;
  setup.system.update(DT);
}

describe('drops', () => {
  it('second drop despawns the first (never two on field)', () => {
    const s = makeSetup();
    s.bus.emit('powerupDrop', {});
    const first = s.system.current;
    expect(first).not.toBeNull();
    s.bus.emit('powerupDrop', {});
    expect(s.system.current).not.toBe(first);
    expect(s.events.filter((e) => e.type === 'powerupSpawned')).toHaveLength(2);
  });

  it('drops only on the 16 predefined locations, skipping occluded ones', () => {
    // Cover a bunch of drop locations with steel/water.
    const rows = emptyLayout().map((r) => r.split(''));
    for (const [col, row] of CONFIG.powerups.dropLocations.slice(0, 8)) {
      rows[row][col] = col % 2 === 0 ? 'S' : 'W';
    }
    const s = makeSetup({ layoutRows: rows.map((r) => r.join('')) });
    const seen = new Set();
    for (let i = 0; i < 100; i++) {
      s.bus.emit('powerupDrop', {});
      const { x, y } = s.system.current.rect;
      seen.add(`${x / 32},${y / 32}`);
    }
    const valid = new Set(
      CONFIG.powerups.dropLocations.slice(8).map(([c, r]) => `${c},${r}`)
    );
    for (const spot of seen) expect(valid.has(spot)).toBe(true);
  });

  it('pistol stays under its weight cap across many drops', () => {
    const s = makeSetup({ seed: 123 });
    let pistols = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      s.bus.emit('powerupDrop', {});
      if (s.system.current.type === 'pistol') pistols++;
    }
    expect(pistols / N).toBeLessThanOrEqual(0.05);
    expect(pistols).toBeGreaterThan(0); // it does exist
  });
});

describe('effects', () => {
  it('star upgrades tier; at tier 4 stays 4; pickup still scores 500', () => {
    const s = makeSetup();
    // Force star drops by re-dropping until a star lands (seeded, finite).
    const dropStar = () => {
      do {
        s.bus.emit('powerupDrop', {});
      } while (s.system.current.type !== 'star');
    };
    s.session.players[0].tier = 4;
    const score0 = s.session.players[0].score;
    dropStar();
    collect(s, 0);
    expect(s.session.players[0].tier).toBe(4);
    expect(s.session.players[0].score).toBe(score0 + 500);
  });

  it('grenade clears the field, awards 0 kill points, leaves the queue alone', () => {
    const s = makeSetup();
    for (let i = 0; i < 3; i++) {
      const e = createEnemy({ type: 'basic', x: i * 64, y: 0, bus: s.bus });
      s.enemies.push(e);
    }
    do {
      s.bus.emit('powerupDrop', {});
    } while (s.system.current.type !== 'grenade');
    const score0 = s.session.players[0].score;
    collect(s, 0);
    expect(s.enemies.every((e) => e.dead)).toBe(true);
    // 500 for pickup only; no tankDestroyed events -> no kill points.
    expect(s.session.players[0].score).toBe(score0 + 500);
    expect(s.events.filter((e) => e.type === 'tankDestroyed')).toHaveLength(0);
    expect(s.events.filter((e) => e.type === 'fieldWiped')).toHaveLength(1);
  });

  it('shovel fortifies, reverts at t=20s, ring repaired to pristine brick', () => {
    const s = makeSetup();
    // Pre-damage the ring so "repaired" is observable.
    s.grid.applyBulletDamage(208, 355, 'down', 2);
    do {
      s.bus.emit('powerupDrop', {});
    } while (s.system.current.type !== 'shovel');
    collect(s, 0);
    expect(s.grid.halfCellAt(10, 22)).toBe(TERRAIN.STEEL); // fortified

    const ticks = Math.ceil((CONFIG.powerups.shovelDuration + 0.1) / DT);
    for (let i = 0; i < ticks; i++) s.system.update(DT);
    expect(s.grid.halfCellAt(10, 22)).toBe(TERRAIN.EMPTY); // steel gone
    for (let q = 20; q < 24; q++) expect(s.grid.brickQuarterAt(q, 44)).toBe(true);
    expect(s.events.some((e) => e.type === 'powerupExpired' && e.payload.type === 'shovel')).toBe(true);
  });

  it('helmet shields the collector; stopwatch freezes the field; tank adds a life', () => {
    const s = makeSetup();
    const e = createEnemy({ type: 'basic', x: 64, y: 0, bus: s.bus });
    s.enemies.push(e);

    do {
      s.bus.emit('powerupDrop', {});
    } while (s.system.current.type !== 'helmet');
    collect(s, 1);
    expect(s.players[1].tank.invulnTimer).toBeCloseTo(CONFIG.powerups.helmetDuration);
    expect(s.players[0].tank.invulnTimer).toBe(0); // collector only

    do {
      s.bus.emit('powerupDrop', {});
    } while (s.system.current.type !== 'stopwatch');
    collect(s, 0);
    expect(e.frozenByStopwatch).toBe(true); // global

    do {
      s.bus.emit('powerupDrop', {});
    } while (s.system.current.type !== 'tank');
    const lives0 = s.session.players[0].lives;
    collect(s, 0);
    expect(s.session.players[0].lives).toBe(lives0 + 1);
  });

  it('pistol jumps straight to tier 4', () => {
    const s = makeSetup({ seed: 123 });
    do {
      s.bus.emit('powerupDrop', {});
    } while (s.system.current.type !== 'pistol');
    collect(s, 0);
    expect(s.session.players[0].tier).toBe(4);
  });
});
