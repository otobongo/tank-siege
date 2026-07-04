import { describe, it, expect } from 'vitest';
import { createAI, createRng, findPath } from '../src/ai/ai.js';
import { createEnemy } from '../src/entities/enemy.js';
import { createEventBus } from '../src/engine/bullets.js';
import { createGrid } from '../src/engine/grid.js';

const DT = 1 / 60;

function layout(overrides = {}) {
  const rows = Array.from({ length: 13 }, () => '.'.repeat(13).split(''));
  for (const [key, ch] of Object.entries(overrides)) {
    const [col, row] = key.split(',').map(Number);
    rows[row][col] = ch;
  }
  return rows.map((r) => r.join(''));
}

function makeWorld(grid, { players = [] } = {}) {
  const fired = [];
  return {
    world: {
      playerRects: players,
      baseRect: grid.baseRect,
      blockersFor: () => [],
      fire: (req) => fired.push(req),
    },
    fired,
  };
}

function spawnEnemy(type, x, y, bus) {
  const enemy = createEnemy({ type, x, y, bus });
  for (let i = 0; i < 120; i++) enemy.update(DT); // finish telegraph
  return enemy;
}

describe('createRng', () => {
  it('same seed replays the same sequence', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
    const c = createRng(43);
    expect(createRng(42)()).not.toBe(c());
  });
});

describe('findPath', () => {
  it('routes to the base goals on an open field', () => {
    const grid = createGrid(layout());
    const path = findPath(grid, 0, 0, [{ hc: 12, hr: 22 }]);
    expect(path).not.toBeNull();
    expect(path[0]).toEqual({ hc: 0, hr: 0 });
    expect(path[path.length - 1]).toEqual({ hc: 12, hr: 22 });
  });

  it('treats steel as impassable and brick as costly-but-passable', () => {
    // Steel wall across row 6 except a brick plug at column 6.
    const overrides = {};
    for (let c = 0; c < 13; c++) overrides[`${c},6`] = c === 6 ? 'B' : 'S';
    const grid = createGrid(layout(overrides));
    const path = findPath(grid, 12, 0, [{ hc: 12, hr: 22 }]);
    expect(path).not.toBeNull();
    // The only way through row 6 is the brick plug at half-cols 12..13.
    const crossing = path.find((n) => n.hr === 12);
    expect(crossing.hc).toBeGreaterThanOrEqual(11);
    expect(crossing.hc).toBeLessThanOrEqual(13);
  });
});

describe('heavy pathing', () => {
  it('reaches the base ring in bounded steps on an open field (seeded)', () => {
    const grid = createGrid(layout());
    const bus = createEventBus();
    const ai = createAI({ grid, rng: createRng(7) });
    const heavy = spawnEnemy('heavy', 192, 0, bus);
    ai.register(heavy);
    const { world } = makeWorld(grid);

    // Heavy speed is 48 px/s; ~336px of travel needs ~7s. Allow 30s.
    let reached = false;
    for (let i = 0; i < 30 * 60 && !reached; i++) {
      ai.update(DT, world);
      heavy.update(DT);
      const { x, y } = heavy.rect;
      if (y >= 320 && Math.abs(x - 192) <= 96) reached = true;
    }
    expect(reached).toBe(true);
  });

  it('fires at an obstructing brick within one decision tick (seeded)', () => {
    // Corridor: steel everywhere on row 6 except brick at col 6; heavy
    // directly above the plug, so its path must chew through the brick.
    const overrides = {};
    for (let c = 0; c < 13; c++) overrides[`${c},6`] = c === 6 ? 'B' : 'S';
    const grid = createGrid(layout(overrides));
    const bus = createEventBus();
    const ai = createAI({ grid, rng: createRng(3) });
    const heavy = spawnEnemy('heavy', 192, 128, bus); // one block above the wall
    ai.register(heavy);
    const { world, fired } = makeWorld(grid);

    // Drive until it meets the wall, then allow one decision interval.
    for (let i = 0; i < 5 * 60 && fired.length === 0; i++) {
      ai.update(DT, world);
      heavy.update(DT);
      if (heavy.tank.bulletsInFlight > 0) heavy.tank.releaseBullet();
    }
    expect(fired.length).toBeGreaterThan(0);
    expect(fired[0].dir).toBe('down');
  });
});

describe('decoy pressure roles', () => {
  it('with 3+ enemies, at least one holds the base-attacker role', () => {
    const grid = createGrid(layout());
    const bus = createEventBus();
    const ai = createAI({ grid, rng: createRng(1) });
    const enemies = [
      spawnEnemy('basic', 0, 0, bus),
      spawnEnemy('basic', 192, 0, bus),
      spawnEnemy('heavy', 384, 0, bus),
    ];
    for (const e of enemies) ai.register(e);
    const { world } = makeWorld(grid);
    ai.update(DT, world);

    const baseAttackers = ai.roles().filter((r) => r.role === 'base');
    expect(baseAttackers.length).toBeGreaterThanOrEqual(1);
    // Heavy preferred for the job.
    expect(baseAttackers[0].enemy.type).toBe('heavy');
  });

  it('role reassigned when the base attacker dies', () => {
    const grid = createGrid(layout());
    const bus = createEventBus();
    const ai = createAI({ grid, rng: createRng(1) });
    const enemies = [
      spawnEnemy('heavy', 0, 0, bus),
      spawnEnemy('basic', 192, 0, bus),
      spawnEnemy('basic', 384, 0, bus),
      spawnEnemy('basic', 96, 96, bus),
    ];
    for (const e of enemies) ai.register(e);
    const { world } = makeWorld(grid);
    ai.update(DT, world);
    const attacker = ai.roles().find((r) => r.role === 'base').enemy;
    expect(attacker.type).toBe('heavy');

    for (let i = 0; i < 4; i++) attacker.takeHit({ byPlayerId: 1 });
    ai.update(DT, world);
    const survivors = ai.roles();
    expect(survivors).toHaveLength(3);
    expect(survivors.filter((r) => r.role === 'base').length).toBeGreaterThanOrEqual(1);
  });

  it('fewer than 3 enemies: no forced base attacker', () => {
    const grid = createGrid(layout());
    const bus = createEventBus();
    const ai = createAI({ grid, rng: createRng(1) });
    ai.register(spawnEnemy('basic', 0, 0, bus));
    ai.register(spawnEnemy('basic', 192, 0, bus));
    ai.update(DT, makeWorld(grid).world);
    expect(ai.roles().every((r) => r.role === 'player')).toBe(true);
  });
});

describe('line-of-fire and freeze gating', () => {
  it('fires immediately when a player crosses its lane', () => {
    const grid = createGrid(layout());
    const bus = createEventBus();
    const ai = createAI({ grid, rng: createRng(9) });
    const enemy = spawnEnemy('fast', 192, 32, bus); // fast = opportunistic only
    ai.register(enemy);
    // Player directly below in the same column, enemy faces down.
    const { world, fired } = makeWorld(grid, {
      players: [{ x: 192, y: 300, w: 32, h: 32 }],
    });
    enemy.tank.facing = 'down';
    for (let i = 0; i < 30 && fired.length === 0; i++) {
      ai.update(DT, world);
      enemy.update(DT);
    }
    expect(fired.length).toBeGreaterThan(0);
  });

  it('stopwatch freeze gates decisions, movement, and fire', () => {
    const grid = createGrid(layout());
    const bus = createEventBus();
    const ai = createAI({ grid, rng: createRng(9) });
    const enemy = spawnEnemy('basic', 192, 32, bus);
    ai.register(enemy);
    enemy.freeze(10);
    const { world, fired } = makeWorld(grid, {
      players: [{ x: 192, y: 300, w: 32, h: 32 }],
    });
    const before = { ...enemy.rect };
    for (let i = 0; i < 120; i++) ai.update(DT, world);
    expect(enemy.rect).toMatchObject(before);
    expect(fired).toHaveLength(0);
  });
});
