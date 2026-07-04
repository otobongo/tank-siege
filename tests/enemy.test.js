import { describe, it, expect, vi } from 'vitest';
import { createEnemy } from '../src/entities/enemy.js';
import { createEventBus, createBulletSystem } from '../src/engine/bullets.js';
import { createGrid } from '../src/engine/grid.js';
import { CONFIG } from '../src/core/config.js';

const DT = 1 / 60;

function emptyLayout() {
  return Array.from({ length: 13 }, () => '.'.repeat(13));
}

function makeEnemy(type, { bonus = false } = {}) {
  const bus = createEventBus();
  const events = [];
  for (const t of ['tankHit', 'tankDestroyed', 'powerupDrop']) {
    bus.on(t, (p) => events.push({ type: t, payload: p }));
  }
  const enemy = createEnemy({ type, x: 192, y: 96, bonus, bus });
  // Finish the spawn telegraph.
  for (let i = 0; i < 120; i++) enemy.update(DT);
  return { enemy, bus, events };
}

describe('enemy stats', () => {
  it('exposes the four types with config stats', () => {
    for (const [type, points] of [ ['basic', 100], ['fast', 200], ['power', 300], ['heavy', 400] ]) {
      const { enemy } = makeEnemy(type);
      expect(enemy.stats.points).toBe(points);
    }
    expect(() => createEnemy({ type: 'nope', x: 0, y: 0, bus: createEventBus() })).toThrow();
  });
});

describe('heavy durability', () => {
  it('takes exactly 4 hits; 4th emits tankDestroyed with 400 points to shooter', () => {
    const { enemy, events } = makeEnemy('heavy');
    for (let i = 0; i < 3; i++) {
      expect(enemy.takeHit({ byPlayerId: 1 })).toBe('damaged');
      expect(enemy.dead).toBe(false);
    }
    expect(enemy.hp).toBe(1);
    expect(enemy.takeHit({ byPlayerId: 1 })).toBe('destroyed');
    expect(enemy.dead).toBe(true);

    const destroyed = events.filter((e) => e.type === 'tankDestroyed');
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0].payload).toMatchObject({ points: 400, byPlayerId: 1, type: 'heavy' });
  });

  it('hit flash timer arms on every hit (renderer feedback)', () => {
    const { enemy } = makeEnemy('heavy');
    enemy.takeHit({ byPlayerId: 1 });
    expect(enemy.hitFlashTimer).toBeGreaterThan(0);
    expect(enemy.hp).toBe(3); // per-HP tint stepping data for the renderer
  });
});

describe('bonus tanks', () => {
  it('first hit emits powerupDrop once and clears the flag, even on a surviving heavy', () => {
    const { enemy, events } = makeEnemy('heavy', { bonus: true });
    enemy.takeHit({ byPlayerId: 2 });
    expect(enemy.bonus).toBe(false);
    expect(enemy.dead).toBe(false); // heavy survives the hit
    enemy.takeHit({ byPlayerId: 2 });
    enemy.takeHit({ byPlayerId: 2 });
    enemy.takeHit({ byPlayerId: 2 });
    const drops = events.filter((e) => e.type === 'powerupDrop');
    expect(drops).toHaveLength(1);
    expect(drops[0].payload.byPlayerId).toBe(2);
  });
});

describe('stopwatch freeze', () => {
  it('frozen enemies do not move or fire but can be destroyed', () => {
    const { enemy } = makeEnemy('basic');
    const grid = createGrid(emptyLayout());
    enemy.freeze(10);

    const y0 = enemy.rect.y;
    enemy.drive('down', DT, (r) => grid.isSolidForTank(r));
    expect(enemy.rect.y).toBe(y0);
    expect(enemy.tryFire()).toBeNull();

    expect(enemy.takeHit({ byPlayerId: 1 })).toBe('destroyed');
  });

  it('thaws after the duration', () => {
    const { enemy } = makeEnemy('basic');
    const grid = createGrid(emptyLayout());
    enemy.freeze(0.2);
    for (let i = 0; i < 30; i++) enemy.update(DT);
    expect(enemy.frozenByStopwatch).toBe(false);
    for (let i = 0; i < 60; i++) enemy.drive('down', DT, (r) => grid.isSolidForTank(r));
    expect(enemy.rect.y).toBeGreaterThan(96);
  });
});

describe('spawn telegraph', () => {
  it('is ignored by bullets until materialized', () => {
    const bus = createEventBus();
    const grid = createGrid(emptyLayout());
    const system = createBulletSystem({ grid, bus });
    const onHit = vi.fn();
    bus.on('tankHit', onHit);

    const enemy = createEnemy({ type: 'basic', x: 192, y: 96, bus });
    expect(enemy.tank.state).toBe('spawning');
    expect(enemy.impact()).toBe('ignore');

    system.spawn({ x: 100, y: 108, dir: 'right', speed: 320, side: 'player' });
    for (let i = 0; i < 10; i++) {
      system.update(DT, { targets: [{ rect: enemy.rect, ref: enemy, side: 'enemy', impact: enemy.impact }] });
    }
    expect(onHit).not.toHaveBeenCalled(); // bullet passed through
  });

  it('cannot fire or move while telegraphing', () => {
    const bus = createEventBus();
    const enemy = createEnemy({ type: 'fast', x: 0, y: 0, bus });
    expect(enemy.tryFire()).toBeNull();
    const grid = createGrid(emptyLayout());
    enemy.drive('down', DT, (r) => grid.isSolidForTank(r));
    expect(enemy.rect.y).toBe(0);
    // Telegraph runs its course.
    const dur = CONFIG.tank.enemy.spawnTelegraphDuration;
    for (let i = 0; i <= Math.ceil(dur / DT); i++) enemy.update(DT);
    expect(enemy.tank.state).toBe('alive');
    expect(enemy.tryFire()).not.toBeNull();
  });
});
