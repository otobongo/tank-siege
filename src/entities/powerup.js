/**
 * Power-up field entity: a pickup sitting at one of the 16 predefined
 * drop locations. Behavior (effects, timers, replacement) lives in
 * systems/powerups.js; the renderer reads `age` for blinking.
 *
 * Public interface (owned by TS-013):
 *   createPowerup({ type, col, row }) -> { type, rect, age }
 */

import { CONFIG } from '../core/config.js';

export function createPowerup({ type, col, row }) {
  const px = CONFIG.grid.blockPx;
  return {
    type,
    rect: { x: col * px, y: row * px, w: px, h: px },
    age: 0,
  };
}
