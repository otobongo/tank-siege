/**
 * Optional CRT post-filter: scanlines + slight vignette + mild
 * phosphor glow, all pre-rendered once into a static overlay canvas.
 * apply() is a single drawImage, so the cost is near zero when on and
 * exactly zero when off (default OFF).
 *
 * Public interface (owned by TS-022):
 *   createCrt({ createCanvas? }) -> { enabled, toggle(), apply(ctx) }
 */

import { CONFIG } from '../core/config.js';

export function createCrt({ createCanvas } = {}) {
  const W = CONFIG.canvas.width;
  const H = CONFIG.canvas.height;
  const mkCanvas =
    createCanvas ??
    ((w, h) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    });

  const overlay = mkCanvas(W, H);
  const octx = overlay.getContext('2d');

  // Scanlines: darken every other row.
  octx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  for (let y = 0; y < H; y += 2) octx.fillRect(0, y, W, 1);

  // Vignette: radial darkening toward the corners.
  const g = octx.createRadialGradient(W / 2, H / 2, H / 2.4, W / 2, H / 2, H);
  g.addColorStop(0, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  octx.fillStyle = g;
  octx.fillRect(0, 0, W, H);

  // Mild phosphor bleed: a faint additive column tint pattern.
  octx.globalCompositeOperation = 'lighter';
  octx.fillStyle = 'rgba(60, 255, 60, 0.02)';
  for (let x = 0; x < W; x += 3) octx.fillRect(x, 0, 1, H);
  octx.globalCompositeOperation = 'source-over';

  let enabled = false;

  return {
    get enabled() {
      return enabled;
    },
    set enabled(v) {
      enabled = v === true;
    },
    toggle() {
      enabled = !enabled;
      return enabled;
    },
    apply(ctx) {
      if (!enabled) return;
      ctx.drawImage(overlay, 0, 0);
    },
  };
}
