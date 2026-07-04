/**
 * Stage intro: gray curtain closes over the field, "STAGE N" shows,
 * then the curtain opens into play. Timing is driven by the flow
 * (TS-014, ~2s total); this screen renders the phase from its own
 * clock, split close/hold/open.
 *
 * Public interface (owned by TS-019):
 *   createStageIntroScreen({ ctx, getStage, renderWorld }) -> handler
 */

import { CONFIG } from '../core/config.js';

const P = CONFIG.palette;
const W = CONFIG.canvas.width;
const H = CONFIG.canvas.height;
const DURATION = 2.0;

export function createStageIntroScreen({ ctx, getStage, renderWorld }) {
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

      // Curtain: fully closed for the middle stretch, animating at the ends.
      const t = Math.min(1, time / DURATION);
      let closed = 1;
      if (t < 0.25) closed = t / 0.25;
      else if (t > 0.75) closed = (1 - t) / 0.25;
      const half = (H / 2) * Math.max(0, Math.min(1, closed));

      ctx.fillStyle = P.uiGray;
      ctx.fillRect(0, 0, W, half);
      ctx.fillRect(0, H - half, W, half);

      if (closed > 0.9) {
        ctx.fillStyle = P.uiDark;
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`STAGE ${String(getStage()).padStart(2, '0')}`, W / 2, H / 2);
      }
    },
  };
}
