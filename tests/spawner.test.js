import { describe, it, expect } from 'vitest';
import { createSpawner, spawnPointRect } from '../src/systems/spawner.js';
import { createEventBus } from '../src/engine/bullets.js';

const DT = 1 / 60;

function makeStage(enemies = 'b'.repeat(20), spawnInterval = 1.0) {
  return { enemies: enemies.split(''), spawnInterval };
}

function makeSpawner({
  stage = makeStage(),
  playerCount = 1,
  isBlockedAt = () => false,
} = {}) {
  const spawned = [];
  const spawner = createSpawner({
    stage,
    playerCount,
    bus: createEventBus(),
    isBlockedAt,
    onSpawn: (d) => spawned.push(d),
  });
  return { spawner, spawned };
}

function runSeconds(spawner, seconds) {
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i++) spawner.update(DT);
}

describe('spawn queue', () => {
  it('flags exactly tanks #4, #11, #18 (1-based) as bonus', () => {
    const { spawner, spawned } = makeSpawner({
      stage: makeStage('bbbbbbbbbbbbbbbbbbff', 0.8),
    });
    // Let everything spawn; remove tanks continuously so cap never binds.
    for (let i = 0; i < 5000 && spawned.length < 20; i++) {
      spawner.update(DT);
      while (spawner.onFieldCount > 0) spawner.noteEnemyRemoved();
    }
    expect(spawned).toHaveLength(20);
    const bonusIndices = spawned.filter((d) => d.bonus).map((d) => d.index);
    expect(bonusIndices).toEqual([3, 10, 17]);
  });

  it('cycles the three spawn points in order', () => {
    const { spawner, spawned } = makeSpawner();
    for (let i = 0; i < 5000 && spawned.length < 6; i++) {
      spawner.update(DT);
      while (spawner.onFieldCount > 0) spawner.noteEnemyRemoved();
    }
    expect(spawned.slice(0, 6).map((d) => d.pointIndex)).toEqual([0, 1, 2, 0, 1, 2]);
    expect(spawned[0]).toMatchObject({ x: 0, y: 0 });
    expect(spawned[1]).toMatchObject({ x: 192, y: 0 }); // center col 6
    expect(spawned[2]).toMatchObject({ x: 384, y: 0 }); // right col 12
  });

  it('respects the 1P cap of 4: 5th spawn deferred until a slot frees', () => {
    const { spawner, spawned } = makeSpawner();
    runSeconds(spawner, 30);
    expect(spawned).toHaveLength(4);
    expect(spawner.onFieldCount).toBe(4);

    spawner.noteEnemyRemoved();
    runSeconds(spawner, 1); // attempt is overdue; fires on a free slot
    expect(spawned).toHaveLength(5);
  });

  it('2P cap is 6', () => {
    const { spawner, spawned } = makeSpawner({ playerCount: 2 });
    runSeconds(spawner, 30);
    expect(spawned).toHaveLength(6);
  });

  it('blocked spawn point defers without skipping queue order', () => {
    // Block the center point (index 1) for a while.
    let centerBlocked = true;
    const center = spawnPointRect(1);
    const { spawner, spawned } = makeSpawner({
      isBlockedAt: (rect) => centerBlocked && rect.x === center.x,
    });

    for (let i = 0; i < 600; i++) {
      spawner.update(DT);
      while (spawner.onFieldCount > 0) spawner.noteEnemyRemoved();
    }
    // Only the first (left) tank spawned; #2 waits for center to free.
    expect(spawned).toHaveLength(1);
    expect(spawned[0].index).toBe(0);

    centerBlocked = false;
    for (let i = 0; i < 600 && spawned.length < 3; i++) {
      spawner.update(DT);
      while (spawner.onFieldCount > 0) spawner.noteEnemyRemoved();
    }
    // Order preserved: queue index 1 lands on the center point.
    expect(spawned[1]).toMatchObject({ index: 1, pointIndex: 1 });
    expect(spawned[2]).toMatchObject({ index: 2, pointIndex: 2 });
  });

  it('allDefeated only when queue empty AND field empty', () => {
    const { spawner, spawned } = makeSpawner({ stage: makeStage('b'.repeat(20), 0.8) });
    for (let i = 0; i < 10000 && spawned.length < 20; i++) {
      spawner.update(DT);
      // Keep exactly one tank on field to test the second condition.
      while (spawner.onFieldCount > 1) spawner.noteEnemyRemoved();
    }
    expect(spawned).toHaveLength(20);
    expect(spawner.remaining).toBe(0);
    expect(spawner.allDefeated).toBe(false); // one still on field
    spawner.noteEnemyRemoved();
    expect(spawner.allDefeated).toBe(true);
  });

  it('remaining depletes on spawn, not on death', () => {
    const { spawner } = makeSpawner();
    expect(spawner.remaining).toBe(20);
    runSeconds(spawner, 30); // 4 spawned (cap)
    expect(spawner.remaining).toBe(16);
    spawner.noteEnemyRemoved(); // a death does not change remaining
    expect(spawner.remaining).toBe(16);
  });

  it('rejects malformed stages', () => {
    expect(() =>
      createSpawner({
        stage: makeStage('b'.repeat(19)),
        playerCount: 1,
        bus: createEventBus(),
        isBlockedAt: () => false,
      })
    ).toThrow();
    expect(() =>
      createSpawner({
        stage: { enemies: 'x'.repeat(20).split(''), spawnInterval: 1 },
        playerCount: 1,
        bus: createEventBus(),
        isBlockedAt: () => false,
      })
    ).toThrow();
  });
});
