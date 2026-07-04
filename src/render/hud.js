/**
 * Sidebar HUD: remaining-enemy icon grid (depletes as tanks SPAWN,
 * like the original), per-player lives with P1/P2 tags, stage flag +
 * number, loop indicator (small x2 after the first loop).
 *
 * Public interface (owned by TS-018):
 *   drawHud(ctx, atlas, data)
 *   data = { remaining, players: [{ id, lives, out }], stage, loop }
 */

import { CONFIG } from '../core/config.js';

const P = CONFIG.palette;
const X0 = CONFIG.canvas.playfieldWidth; // sidebar left edge

function drawSprite(ctx, atlas, key, x, y, scale = 1) {
  const s = atlas.get(key);
  ctx.drawImage(atlas.canvas, s.sx, s.sy, s.sw, s.sh, x, y, s.sw * scale, s.sh * scale);
}

export function drawHud(ctx, atlas, { remaining, players, stage, loop }) {
  const w = CONFIG.canvas.sidebarWidth;
  const h = CONFIG.canvas.height;

  ctx.fillStyle = P.uiGray;
  ctx.fillRect(X0, 0, w, h);

  // Remaining-enemy icons: two columns, top-down.
  const iconsPerCol = 10;
  for (let i = 0; i < remaining; i++) {
    const col = Math.floor(i / iconsPerCol);
    const row = i % iconsPerCol;
    drawSprite(ctx, atlas, 'hud-enemy', X0 + 16 + col * 12, 16 + row * 12);
  }

  // Player lives.
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  players.forEach((p, i) => {
    const y = 180 + i * 40;
    ctx.fillStyle = P.uiDark;
    ctx.fillText(`${i === 0 ? 'I' : 'II'}P`, X0 + 16, y);
    drawSprite(ctx, atlas, 'hud-life', X0 + 16, y + 14);
    ctx.fillStyle = p.out ? P.alertRed : P.uiDark;
    ctx.fillText(String(Math.max(0, p.lives)), X0 + 30, y + 14);
  });

  // Stage flag + number + loop indicator.
  drawSprite(ctx, atlas, 'flag', X0 + 16, h - 64, 2);
  ctx.fillStyle = P.uiDark;
  ctx.font = '14px monospace';
  ctx.fillText(String(stage), X0 + 52, h - 50);
  if (loop > 0) {
    ctx.font = '10px monospace';
    ctx.fillText(`x${loop + 1}`, X0 + 52, h - 34);
  }
}
