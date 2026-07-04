/**
 * Game over: red text slides up from the bottom, holds, then returns
 * to the title on any input (or after a generous timeout).
 *
 * Public interface (owned by TS-019):
 *   createGameOverScreen({ ctx, actions, renderWorld, onDone })
 */

import { CONFIG } from '../core/config.js';

const P = CONFIG.palette;
const W = CONFIG.canvas.width;
const H = CONFIG.canvas.height;
const SLIDE_DURATION = 2.0;
const TIMEOUT = 8.0;

export function createGameOverScreen({ ctx, actions, renderWorld, onDone }) {
  let time = 0;

  return {
    enter() {
      time = 0;
    },
    update(dt) {
      time += dt;
      const done =
        time > SLIDE_DURATION &&
        (actions.justPressed('fire') || actions.justPressed('start') || time > TIMEOUT);
      if (done) onDone();
    },
    render() {
      renderWorld?.();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(0, 0, W, H);

      const t = Math.min(1, time / SLIDE_DURATION);
      const y = H - (H / 2) * t;
      ctx.fillStyle = P.alertRed;
      ctx.font = 'bold 36px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('GAME OVER', W / 2, y);
      if (t >= 1) {
        ctx.font = '12px monospace';
        ctx.fillStyle = P.uiGray;
        ctx.fillText('FIRE TO RETURN TO TITLE', W / 2, y + 48);
      }
    },
  };
}
