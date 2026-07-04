/**
 * Pause overlay: the frozen world stays visible, dimmed, with a
 * blinking PAUSE. Resume is handled by the orchestrator (it owns the
 * PLAYING <-> PAUSED transition on the pause action edge).
 *
 * Public interface (owned by TS-019):
 *   createPauseScreen({ ctx, renderWorld }) -> handler
 */

import { CONFIG } from '../core/config.js';

const P = CONFIG.palette;
const W = CONFIG.canvas.width;
const H = CONFIG.canvas.height;

export function createPauseScreen({ ctx, renderWorld }) {
  let time = 0;

  return {
    enter() {
      time = 0;
    },
    update(dt) {
      time += dt;
    },
    render() {
      renderWorld?.();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(0, 0, W, H);
      if (Math.floor(time * 2) % 2 === 0) {
        ctx.fillStyle = P.alertRed;
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PAUSE', W / 2, H / 2);
      }
    },
  };
}
