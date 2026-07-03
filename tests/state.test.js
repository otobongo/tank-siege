import { describe, it, expect, vi } from 'vitest';
import { createAccumulator } from '../src/core/loop.js';
import { createStateMachine, createSession, STATES } from '../src/core/state.js';

describe('accumulator', () => {
  const stepMs = 1000 / 60;

  it('produces exactly 60 updates for 1.0s of injected time', () => {
    const acc = createAccumulator({ stepMs, maxAccumulatedMs: Infinity });
    let steps = 0;
    // Feed in uneven chunks to exercise remainder carrying.
    for (const chunk of [400, 250, 350]) steps += acc.advance(chunk);
    expect(steps).toBe(60);
  });

  it('produces exactly 90 updates for 1.5s of injected time', () => {
    const acc = createAccumulator({ stepMs, maxAccumulatedMs: Infinity });
    let steps = 0;
    for (let i = 0; i < 100; i++) steps += acc.advance(15);
    expect(steps).toBe(90);
  });

  it('clamps banked time (spiral-of-death guard)', () => {
    const acc = createAccumulator({ stepMs, maxAccumulatedMs: 250 });
    // A 10-second stall must not schedule 600 catch-up steps.
    // 250ms at 60Hz is exactly 15 steps.
    expect(acc.advance(10000)).toBe(15);
  });

  it('reset drops partial time', () => {
    const acc = createAccumulator({ stepMs, maxAccumulatedMs: 250 });
    acc.advance(10); // less than one step, banked
    acc.reset();
    expect(acc.advance(10)).toBe(0); // would be 1 without the reset
  });
});

describe('state machine', () => {
  function hookSpies() {
    return { enter: vi.fn(), update: vi.fn(), render: vi.fn(), exit: vi.fn() };
  }

  it('PLAYING -> PAUSED -> PLAYING fires exit/enter exactly once each', () => {
    const playing = hookSpies();
    const paused = hookSpies();
    const m = createStateMachine({ PLAYING: playing, PAUSED: paused }, STATES.PLAYING);

    expect(playing.enter).toHaveBeenCalledTimes(1);

    m.transition(STATES.PAUSED);
    expect(playing.exit).toHaveBeenCalledTimes(1);
    expect(paused.enter).toHaveBeenCalledTimes(1);

    m.update(1 / 60);
    expect(playing.update).not.toHaveBeenCalled(); // not called while paused
    expect(paused.update).toHaveBeenCalledTimes(1);

    m.transition(STATES.PLAYING);
    expect(paused.exit).toHaveBeenCalledTimes(1);
    expect(playing.enter).toHaveBeenCalledTimes(2);

    m.update(1 / 60);
    expect(playing.update).toHaveBeenCalledTimes(1);
  });

  it('self-transition is a no-op', () => {
    const playing = hookSpies();
    const m = createStateMachine({ PLAYING: playing }, STATES.PLAYING);
    m.transition(STATES.PLAYING);
    expect(playing.enter).toHaveBeenCalledTimes(1);
    expect(playing.exit).not.toHaveBeenCalled();
  });

  it('rejects unknown states', () => {
    expect(() => createStateMachine({ BOGUS: {} }, 'BOGUS')).toThrow();
    const m = createStateMachine({ TITLE: {} }, STATES.TITLE);
    expect(() => m.transition('NOPE')).toThrow();
  });

  it('passes payload to enter', () => {
    const intro = hookSpies();
    const m = createStateMachine(
      { TITLE: {}, STAGE_INTRO: intro },
      STATES.TITLE
    );
    m.transition(STATES.STAGE_INTRO, { stage: 7 });
    expect(intro.enter).toHaveBeenCalledWith({ stage: 7 });
  });
});

describe('session', () => {
  it('initializes per-player data', () => {
    const s = createSession(2);
    expect(s.players).toHaveLength(2);
    expect(s.players[0]).toMatchObject({ id: 1, score: 0, lives: 3, tier: 1 });
    expect(s.players[1].id).toBe(2);
    expect(s.stage).toBe(1);
  });
});
