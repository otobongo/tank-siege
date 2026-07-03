/**
 * Game state machine and session data.
 *
 * Public interface (owned by TS-003):
 *   STATES: frozen enum of state names
 *   createStateMachine(handlers, initial) -> {
 *     current, transition(name, payload), update(dt), render(ctx), is(name)
 *   }
 *   createSession(playerCount) -> mutable per-run session object
 *
 * Each state handler may define enter(payload), update(dt), render(ctx),
 * exit(). All hooks are optional. update/render are only dispatched to
 * the current state; PAUSED is a real state, so PLAYING.update simply
 * stops being called while paused.
 */

import { CONFIG } from './config.js';

export const STATES = Object.freeze({
  TITLE: 'TITLE',
  STAGE_INTRO: 'STAGE_INTRO',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  TALLY: 'TALLY',
  GAME_OVER: 'GAME_OVER',
});

/**
 * @param {Record<string, {enter?, update?, render?, exit?}>} handlers
 *   map of state name -> hook object. Every key must be a STATES value.
 * @param {string} initial starting state (enter hook fires immediately)
 */
export function createStateMachine(handlers, initial = STATES.TITLE) {
  for (const name of Object.keys(handlers)) {
    if (!STATES[name]) throw new Error(`Unknown state: ${name}`);
  }

  let current = null;

  const machine = {
    get current() {
      return current;
    },
    is(name) {
      return current === name;
    },
    transition(name, payload) {
      if (!handlers[name]) throw new Error(`No handler for state: ${name}`);
      if (name === current) return;
      handlers[current]?.exit?.();
      current = name;
      handlers[name].enter?.(payload);
    },
    update(dt) {
      handlers[current]?.update?.(dt);
    },
    render(ctx) {
      handlers[current]?.render?.(ctx);
    },
  };

  machine.transition(initial);
  return machine;
}

/**
 * Per-run session data. Lives on the state machine's owner (main.js)
 * and is passed to systems that need it.
 * @param {1|2} playerCount
 */
export function createSession(playerCount = 1) {
  return {
    playerCount,
    stage: 1, // 1-based, keeps counting past 35 (loop logic in TS-014)
    loop: 0, // completed campaign loops
    rngSeed: 1, // seeded RNG for deterministic AI (TS-012)
    players: Array.from({ length: playerCount }, (_, i) => ({
      id: i + 1,
      score: 0,
      lives: CONFIG.tank.player.startLives,
      tier: 1,
      nextLifeAt: CONFIG.scoring.extraLifeAt,
      // per-type kill counts for the tally screen
      kills: { basic: 0, fast: 0, power: 0, heavy: 0 },
    })),
  };
}
