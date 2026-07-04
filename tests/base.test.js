import { describe, it, expect, vi } from 'vitest';
import { createBase } from '../src/entities/base.js';
import { createEventBus } from '../src/engine/bullets.js';
import { createGrid, TERRAIN } from '../src/engine/grid.js';
import { createStateMachine, STATES } from '../src/core/state.js';

function emptyLayout() {
  return Array.from({ length: 13 }, () => '.'.repeat(13));
}

describe('base entity', () => {
  it('baseHit -> GAME_OVER next tick regardless of lives', () => {
    const grid = createGrid(emptyLayout());
    const bus = createEventBus();

    // Minimal TS-014-style wiring: destruction sets a flag, the PLAYING
    // state's update consumes it on the following tick.
    let gameOverPending = false;
    const machine = createStateMachine(
      {
        PLAYING: {
          update() {
            if (gameOverPending) machine.transition(STATES.GAME_OVER);
          },
        },
        GAME_OVER: {},
      },
      STATES.PLAYING
    );
    createBase({ grid, bus, onDestroyed: () => (gameOverPending = true) });

    bus.emit('baseHit', { x: 200, y: 390 });
    expect(machine.current).toBe(STATES.PLAYING); // not synchronous
    machine.update(1 / 60);
    expect(machine.current).toBe(STATES.GAME_OVER); // lives never consulted
  });

  it('destroys exactly once and emits baseDestroyed', () => {
    const grid = createGrid(emptyLayout());
    const bus = createEventBus();
    const onDestroyed = vi.fn();
    const destroyedEvents = vi.fn();
    bus.on('baseDestroyed', destroyedEvents);
    const base = createBase({ grid, bus, onDestroyed });

    bus.emit('baseHit', { x: 1, y: 1 });
    bus.emit('baseHit', { x: 2, y: 2 });
    expect(base.destroyed).toBe(true);
    expect(onDestroyed).toHaveBeenCalledTimes(1);
    expect(destroyedEvents).toHaveBeenCalledTimes(1);
  });

  it('fortify/revert delegate to the grid', () => {
    const grid = createGrid(emptyLayout());
    const base = createBase({ grid, bus: createEventBus(), onDestroyed: null });
    base.fortify();
    expect(grid.halfCellAt(10, 22)).toBe(TERRAIN.STEEL);
    base.revert();
    expect(grid.halfCellAt(10, 22)).toBe(TERRAIN.EMPTY);
    expect(grid.brickQuarterAt(20, 44)).toBe(true); // pristine brick again
  });
});
