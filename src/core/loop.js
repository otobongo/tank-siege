/**
 * Fixed-step update loop with rAF-driven rendering.
 *
 * The simulation advances in fixed steps (CONFIG.simulation.updateHz),
 * decoupled from display refresh. No interpolation: retro feel wants
 * stepped motion. An accumulator clamp guards against the spiral of
 * death, and the accumulator pauses while the tab is hidden.
 *
 * Public interface (owned by TS-003):
 *   createAccumulator({ stepMs, maxAccumulatedMs }) -> { advance(elapsedMs): number, reset() }
 *   createLoop({ update, render, updateHz, maxAccumulatedMs }) -> { start(), stop(), running }
 */

import { CONFIG } from './config.js';

/**
 * Pure fixed-step accumulator. Feed it elapsed wall-clock time; it
 * returns how many whole simulation steps to run, carrying the
 * remainder. Excess time beyond maxAccumulatedMs is discarded.
 */
export function createAccumulator({
  stepMs,
  maxAccumulatedMs = CONFIG.simulation.maxAccumulatedMs,
} = {}) {
  let accumulated = 0;
  // stepMs is usually irrational in binary (1000/60); EPSILON_MS keeps
  // integer-exact inputs (e.g. 1000ms at 60Hz) from flooring one short.
  const EPSILON_MS = 1e-6;
  return {
    /**
     * @param {number} elapsedMs wall-clock time since the last call
     * @returns {number} whole simulation steps to execute now
     */
    advance(elapsedMs) {
      accumulated = Math.min(accumulated + elapsedMs, maxAccumulatedMs);
      const steps = Math.floor((accumulated + EPSILON_MS) / stepMs);
      accumulated = Math.max(0, accumulated - steps * stepMs);
      return steps;
    },
    /** Drop any banked partial time (used on tab refocus). */
    reset() {
      accumulated = 0;
    },
  };
}

/**
 * Browser loop driver. update(dt) is called 0..n times per frame with
 * a fixed dt in seconds; render() once per animation frame.
 */
export function createLoop({
  update,
  render,
  updateHz = CONFIG.simulation.updateHz,
  maxAccumulatedMs = CONFIG.simulation.maxAccumulatedMs,
}) {
  const stepMs = 1000 / updateHz;
  const dt = 1 / updateHz;
  const accumulator = createAccumulator({ stepMs, maxAccumulatedMs });

  let rafId = 0;
  let lastTime = 0;
  let running = false;

  function frame(now) {
    if (!running) return;
    const elapsed = now - lastTime;
    lastTime = now;
    const steps = accumulator.advance(elapsed);
    for (let i = 0; i < steps; i++) update(dt);
    render();
    rafId = requestAnimationFrame(frame);
  }

  function onVisibilityChange() {
    if (!document.hidden) {
      // Discard hidden time so the sim does not fast-forward on return.
      lastTime = performance.now();
      accumulator.reset();
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastTime = performance.now();
      accumulator.reset();
      document.addEventListener('visibilitychange', onVisibilityChange);
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    },
    get running() {
      return running;
    },
  };
}
