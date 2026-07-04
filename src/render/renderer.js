/**
 * Draw-order orchestration (plan TS-018):
 *   terrain (cached layer + dirty-tile repaint) -> base -> powerup
 *   (blinking) -> tanks/bullets -> tree canopy -> particles -> HUD.
 *
 * The static terrain (brick, steel, ice) is painted once per stage
 * into an offscreen layer; consumeDirtyTiles() drives 8px repaints as
 * bullets chew walls. Water animates (2-frame shimmer) and trees are
 * a canopy drawn OVER tanks, so both render from per-stage position
 * lists instead of the cache.
 *
 * Public interface (owned by TS-018):
 *   createRenderer({ ctx, atlas, createCanvas? }) -> {
 *     setGrid(grid), render(scene)
 *   }
 *   scene = { grid, time, shakeOffset, base, players, enemies,
 *             bullets, powerup, particles, hud }
 */

import { CONFIG } from '../core/config.js';
import { TERRAIN } from '../engine/grid.js';

const P = CONFIG.palette;
const HPX = CONFIG.grid.halfCellPx;
const QPX = CONFIG.grid.quarterCellPx;
const HALF = CONFIG.grid.halfCells;
const QUARTER = CONFIG.grid.quarterCells;
const FIELD = CONFIG.canvas.playfieldWidth;

export function createRenderer({ ctx, atlas, createCanvas } = {}) {
  const mkCanvas =
    createCanvas ??
    ((w, h) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    });

  const terrainLayer = mkCanvas(FIELD, FIELD);
  const terrainCtx = terrainLayer.getContext('2d');
  let grid = null;
  let waterCells = []; // [{x, y}] half-cell px positions
  let treeCells = [];

  function sprite(key) {
    return atlas.get(key);
  }

  function draw(key, x, y, targetCtx = ctx, scale = 1) {
    const s = sprite(key);
    targetCtx.drawImage(atlas.canvas, s.sx, s.sy, s.sw, s.sh, x, y, s.sw * scale, s.sh * scale);
  }

  /** Repaint one quarter cell of the static layer from grid state. */
  function paintQuarter(qc, qr) {
    const x = qc * QPX;
    const y = qr * QPX;
    terrainCtx.clearRect(x, y, QPX, QPX);
    if (grid.brickQuarterAt(qc, qr)) {
      draw('terrain-brick-q', x, y, terrainCtx);
      return;
    }
    // Steel/ice live at half-cell resolution; repaint the quadrant.
    const t = grid.halfCellAt(qc >> 1, qr >> 1);
    if (t === TERRAIN.STEEL || t === TERRAIN.ICE) {
      const key = t === TERRAIN.STEEL ? 'terrain-steel' : 'terrain-ice';
      const s = sprite(key);
      // Draw the matching 8px quadrant of the 16px tile.
      const ox = (qc & 1) * QPX;
      const oy = (qr & 1) * QPX;
      terrainCtx.drawImage(atlas.canvas, s.sx + ox, s.sy + oy, QPX, QPX, x, y, QPX, QPX);
    }
  }

  return {
    /** Bind a stage's grid and rebuild the static terrain layer. */
    setGrid(newGrid) {
      grid = newGrid;
      waterCells = [];
      treeCells = [];
      terrainCtx.clearRect(0, 0, FIELD, FIELD);
      for (let hr = 0; hr < HALF; hr++) {
        for (let hc = 0; hc < HALF; hc++) {
          const t = grid.halfCellAt(hc, hr);
          const x = hc * HPX;
          const y = hr * HPX;
          if (t === TERRAIN.STEEL) draw('terrain-steel', x, y, terrainCtx);
          else if (t === TERRAIN.ICE) draw('terrain-ice', x, y, terrainCtx);
          else if (t === TERRAIN.WATER) waterCells.push({ x, y });
          else if (t === TERRAIN.TREE) treeCells.push({ x, y });
        }
      }
      for (let qr = 0; qr < QUARTER; qr++) {
        for (let qc = 0; qc < QUARTER; qc++) {
          if (grid.brickQuarterAt(qc, qr)) draw('terrain-brick-q', qc * QPX, qr * QPX, terrainCtx);
        }
      }
      grid.consumeDirtyTiles(); // cache is fresh
    },

    render(scene) {
      const { time = 0, shakeOffset = { x: 0, y: 0 } } = scene;

      // Repaint dirty quarters into the cache before compositing.
      if (grid) {
        for (const { qc, qr } of grid.consumeDirtyTiles()) paintQuarter(qc, qr);
      }

      ctx.fillStyle = P.black;
      ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);

      ctx.save();
      ctx.translate(shakeOffset.x, shakeOffset.y);
      ctx.beginPath();
      ctx.rect(0, 0, FIELD, FIELD);
      ctx.clip();

      // 1. Terrain.
      ctx.drawImage(terrainLayer, 0, 0);
      const waterFrame = Math.floor(time * 2) % 2;
      for (const c of waterCells) draw(`terrain-water-${waterFrame}`, c.x, c.y);

      // 2. Base.
      if (scene.base) {
        draw(scene.base.destroyed ? 'eagle-destroyed' : 'eagle-intact', scene.base.rect.x, scene.base.rect.y);
      }

      // 3. Power-up (blinking).
      if (scene.powerup && Math.floor(scene.powerup.age * 4) % 2 === 0) {
        draw(`powerup-${scene.powerup.type}`, scene.powerup.rect.x, scene.powerup.rect.y, ctx, 2);
      }

      // 4. Tanks and bullets.
      for (const player of scene.players ?? []) {
        this.drawPlayer(player, time);
      }
      for (const enemy of scene.enemies ?? []) {
        this.drawEnemy(enemy, time);
      }
      ctx.fillStyle = P.white;
      for (const b of scene.bullets ?? []) {
        ctx.fillStyle = P.uiGray;
        ctx.fillRect(b.rect.x, b.rect.y, b.rect.w, b.rect.h);
        ctx.fillStyle = P.white;
        ctx.fillRect(b.rect.x + 2, b.rect.y + 2, b.rect.w - 4, b.rect.h - 4);
      }

      // 5. Tree canopy hides tanks beneath it.
      for (const c of treeCells) draw('terrain-tree', c.x, c.y);

      // 6. Particles.
      scene.particles?.render(ctx);

      ctx.restore();

      // 7. HUD (outside the shake translate).
      scene.hud?.(ctx);
    },

    drawPlayer(player, time) {
      const t = player.tank;
      if (t.state === 'dead') return;
      const frame = t.moving ? Math.floor(time * 12) % 2 : 0;
      if (t.state === 'spawning') {
        draw(`sparkle-${Math.floor(time * 8) % 4}`, t.rect.x + 8, t.rect.y + 8);
        return;
      }
      draw(`player-t${player.tier}-${t.facing}-${frame}`, t.rect.x, t.rect.y, ctx, 2);
      if (t.invulnTimer > 0) {
        draw(`shield-${Math.floor(time * 10) % 2}`, t.rect.x, t.rect.y);
      }
    },

    drawEnemy(enemy, time) {
      const t = enemy.tank;
      if (enemy.dead) return;
      if (t.state === 'spawning') {
        draw(`sparkle-${Math.floor(time * 8) % 4}`, t.rect.x + 8, t.rect.y + 8);
        return;
      }
      const frame = t.moving ? Math.floor(time * 12) % 2 : 0;
      draw(`enemy-${enemy.type}-${t.facing}-${frame}`, t.rect.x, t.rect.y, ctx, 2);

      // Tints via composite overlays, not duplicate art.
      let tint = null;
      if (enemy.bonus && Math.floor(time * 6) % 2 === 0) tint = P.bonusFlash;
      else if (enemy.frozenByStopwatch) tint = P.frozenTint;
      else if (enemy.hitFlashTimer > 0) tint = P.white;
      else if (enemy.type === 'heavy' && enemy.hp < enemy.maxHp) {
        // Per-HP tint stepping: darker as damage accumulates.
        const alphaByHp = { 3: 0.15, 2: 0.3, 1: 0.45 };
        ctx.globalAlpha = alphaByHp[enemy.hp] ?? 0;
        ctx.fillStyle = P.alertRed;
        ctx.fillRect(t.rect.x, t.rect.y, t.rect.w, t.rect.h);
        ctx.globalAlpha = 1;
      }
      if (tint) {
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = tint;
        ctx.fillRect(t.rect.x, t.rect.y, t.rect.w, t.rect.h);
        ctx.globalAlpha = 1;
      }
    },
  };
}
