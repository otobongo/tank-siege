import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEventBus, createBulletSystem } from '../src/engine/bullets.js';
import { createGrid } from '../src/engine/grid.js';
import { createTank } from '../src/entities/tank.js';

const DT = 1 / 60;

function layout(overrides = {}) {
  const rows = Array.from({ length: 13 }, () => '.'.repeat(13).split(''));
  for (const [key, ch] of Object.entries(overrides)) {
    const [col, row] = key.split(',').map(Number);
    rows[row][col] = ch;
  }
  return rows.map((r) => r.join(''));
}

function makeWorld(gridOverrides = {}) {
  const grid = createGrid(layout(gridOverrides));
  const bus = createEventBus();
  const system = createBulletSystem({ grid, bus });
  const events = [];
  for (const type of ['brickHit', 'steelClang', 'tankHit', 'baseHit', 'bulletCancel']) {
    bus.on(type, (payload) => events.push({ type, payload }));
  }
  return { grid, bus, system, events };
}

function runTicks(system, n, world = {}) {
  for (let i = 0; i < n; i++) system.update(DT, world);
}

describe('event bus', () => {
  it('subscribes, emits, unsubscribes', () => {
    const bus = createEventBus();
    const cb = vi.fn();
    const off = bus.on('ping', cb);
    bus.emit('ping', 42);
    expect(cb).toHaveBeenCalledWith(42);
    off();
    bus.emit('ping', 43);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('bullet-vs-bullet', () => {
  let w;
  beforeEach(() => {
    w = makeWorld();
  });

  it('opposing bullets on a collision course cancel', () => {
    w.system.spawn({ x: 100, y: 100, dir: 'right', speed: 240, side: 'player' });
    w.system.spawn({ x: 200, y: 100, dir: 'left', speed: 240, side: 'enemy' });
    runTicks(w.system, 30);
    expect(w.system.bullets).toHaveLength(0);
    expect(w.events.filter((e) => e.type === 'bulletCancel')).toHaveLength(1);
  });

  it('same-side bullets do not interact', () => {
    w.system.spawn({ x: 100, y: 100, dir: 'right', speed: 240, side: 'player' });
    w.system.spawn({ x: 200, y: 100, dir: 'left', speed: 240, side: 'player' });
    runTicks(w.system, 5);
    expect(w.system.bullets).toHaveLength(2);
    expect(w.events.filter((e) => e.type === 'bulletCancel')).toHaveLength(0);
  });
});

describe('bullet-vs-terrain', () => {
  it('tier-1 vs steel: steelClang, no damage', () => {
    const w = makeWorld({ '6,2': 'S' });
    w.system.spawn({ x: 150, y: 76, dir: 'right', speed: 240, depth: 1, side: 'player' });
    runTicks(w.system, 30);
    const clangs = w.events.filter((e) => e.type === 'steelClang');
    expect(clangs).toHaveLength(1);
    expect(clangs[0].payload.destroyed).toBe(false);
    expect(w.grid.halfCellAt(12, 4)).toBe('S');
  });

  it('tier-4 destroys steel', () => {
    const w = makeWorld({ '6,2': 'S' });
    w.system.spawn({
      x: 150, y: 76, dir: 'right', speed: 240, depth: 2, destroySteel: true, side: 'player',
    });
    runTicks(w.system, 30);
    const clangs = w.events.filter((e) => e.type === 'steelClang');
    expect(clangs[0].payload.destroyed).toBe(true);
    // The sweep's first lead point is the bullet's top corner (y=76),
    // so the struck half-cell is row 4.
    expect(w.grid.halfCellAt(12, 4)).toBe('.');
  });

  it('brick hits emit brickHit and chew the wall', () => {
    const w = makeWorld({ '6,2': 'B' });
    w.system.spawn({ x: 150, y: 76, dir: 'right', speed: 240, depth: 1, side: 'player' });
    runTicks(w.system, 30);
    expect(w.events.filter((e) => e.type === 'brickHit')).toHaveLength(1);
    expect(w.grid.brickQuarterAt(24, 9)).toBe(false);
  });
});

describe('bullet-vs-base', () => {
  it("player's own bullet on the base triggers baseHit", () => {
    const w = makeWorld();
    // Clear the ring's top block by shooting through it, then hit the eagle.
    for (let i = 0; i < 8; i++) {
      w.system.spawn({ x: 204, y: 300, dir: 'down', speed: 320, depth: 1, side: 'player' });
      runTicks(w.system, 40);
    }
    expect(w.events.some((e) => e.type === 'baseHit')).toBe(true);
  });
});

describe('bullet-vs-tank', () => {
  it('hits an opposing tank and reports it, freeing the slot', () => {
    const w = makeWorld();
    const shooter = createTank({ x: 0, y: 96 });
    shooter.noteFired();
    const enemy = createTank({ x: 200, y: 96 });
    w.system.spawn({
      x: 32, y: 108, dir: 'right', speed: 320, side: 'player', owner: shooter,
    });
    expect(shooter.bulletsInFlight).toBe(1);
    runTicks(w.system, 60, {
      targets: [{ rect: enemy.rect, ref: enemy, side: 'enemy' }],
    });
    const hits = w.events.filter((e) => e.type === 'tankHit');
    expect(hits).toHaveLength(1);
    expect(hits[0].payload.target.ref).toBe(enemy);
    expect(shooter.bulletsInFlight).toBe(0); // slot freed on termination
    expect(w.system.bullets).toHaveLength(0);
  });

  it('never hits its own owner', () => {
    const w = makeWorld();
    const shooter = createTank({ x: 96, y: 96 });
    w.system.spawn({
      x: 96, y: 88, dir: 'up', speed: 320, side: 'player', owner: shooter,
    });
    runTicks(w.system, 3, {
      targets: [{ rect: shooter.rect, ref: shooter, side: 'player' }],
    });
    expect(w.events.filter((e) => e.type === 'tankHit')).toHaveLength(0);
  });

  it('enemy bullets pass through enemy tanks', () => {
    const w = makeWorld();
    const other = createTank({ x: 200, y: 96 });
    w.system.spawn({ x: 32, y: 108, dir: 'right', speed: 320, side: 'enemy' });
    runTicks(w.system, 60, {
      targets: [{ rect: other.rect, ref: other, side: 'enemy' }],
    });
    expect(w.events.filter((e) => e.type === 'tankHit')).toHaveLength(0);
  });

  it('absorb targets consume the bullet silently (helmet)', () => {
    const w = makeWorld();
    const shielded = createTank({ x: 200, y: 96 });
    w.system.spawn({ x: 32, y: 108, dir: 'right', speed: 320, side: 'enemy' });
    runTicks(w.system, 60, {
      targets: [{ rect: shielded.rect, ref: shielded, side: 'player', impact: () => 'absorb' }],
    });
    expect(w.events.filter((e) => e.type === 'tankHit')).toHaveLength(0);
    expect(w.system.bullets).toHaveLength(0);
  });

  it('ignore targets are passed through (spawn telegraph)', () => {
    const w = makeWorld();
    const ghost = createTank({ x: 200, y: 96 });
    w.system.spawn({ x: 32, y: 108, dir: 'right', speed: 320, side: 'enemy' });
    runTicks(w.system, 90, {
      targets: [{ rect: ghost.rect, ref: ghost, side: 'player', impact: () => 'ignore' }],
    });
    expect(w.events.filter((e) => e.type === 'tankHit')).toHaveLength(0);
    // Bullet flew past and died on the field edge instead.
    expect(w.system.bullets).toHaveLength(0);
  });

  it('edge termination frees the slot too', () => {
    const w = makeWorld();
    const shooter = createTank({ x: 96, y: 96 });
    shooter.noteFired();
    w.system.spawn({ x: 96, y: 88, dir: 'up', speed: 320, side: 'player', owner: shooter });
    runTicks(w.system, 60);
    expect(shooter.bulletsInFlight).toBe(0);
    expect(w.system.bullets).toHaveLength(0);
  });
});
