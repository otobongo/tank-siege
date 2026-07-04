/**
 * Procedural pixel-art sprite atlas: every sprite is drawn in code at
 * boot into one offscreen canvas. Original designs throughout, no
 * borrowed pixels. Colors come exclusively from CONFIG.palette.
 *
 * Public interface (owned by TS-017):
 *   SPRITE_KEYS: every key the entities/renderer can request
 *   atlasLayout() -> Map key -> { sx, sy, sw, sh } (pure, no canvas)
 *   createSpriteAtlas({ createCanvas? }) -> {
 *     canvas, get(key), keys()
 *   }
 *
 * Naming (consumed by TS-018):
 *   player-t{1..4}-{up|down|left|right}-{0|1}   16x16
 *   enemy-{basic|fast|power|heavy}-{dir}-{0|1}  16x16
 *   terrain-brick-q 8x8; terrain-steel, terrain-water-0/1,
 *   terrain-ice, terrain-tree 16x16
 *   eagle-intact, eagle-destroyed 32x32
 *   powerup-{star|grenade|helmet|shovel|stopwatch|tank|pistol} 16x16
 *   sparkle-0..3 16x16; shield-0/1 32x32
 *   flag 16x16; hud-life, hud-enemy 8x8
 *
 * Bonus-flash and stopwatch tints are renderer composites, NOT
 * duplicate art.
 */

import { CONFIG } from '../core/config.js';

const P = CONFIG.palette;
const DIRS = ['up', 'down', 'left', 'right'];
const TIERS = [1, 2, 3, 4];
const ENEMIES = ['basic', 'fast', 'power', 'heavy'];

/** Every sprite key with its size. */
function spriteSpecs() {
  const specs = [];
  for (const t of TIERS)
    for (const d of DIRS)
      for (const f of [0, 1]) specs.push({ key: `player-t${t}-${d}-${f}`, w: 16, h: 16 });
  for (const e of ENEMIES)
    for (const d of DIRS)
      for (const f of [0, 1]) specs.push({ key: `enemy-${e}-${d}-${f}`, w: 16, h: 16 });
  specs.push({ key: 'terrain-brick-q', w: 8, h: 8 });
  specs.push({ key: 'terrain-steel', w: 16, h: 16 });
  specs.push({ key: 'terrain-water-0', w: 16, h: 16 });
  specs.push({ key: 'terrain-water-1', w: 16, h: 16 });
  specs.push({ key: 'terrain-ice', w: 16, h: 16 });
  specs.push({ key: 'terrain-tree', w: 16, h: 16 });
  specs.push({ key: 'eagle-intact', w: 32, h: 32 });
  specs.push({ key: 'eagle-destroyed', w: 32, h: 32 });
  for (const p of CONFIG.powerups.types) specs.push({ key: `powerup-${p}`, w: 16, h: 16 });
  for (let i = 0; i < 4; i++) specs.push({ key: `sparkle-${i}`, w: 16, h: 16 });
  specs.push({ key: 'shield-0', w: 32, h: 32 });
  specs.push({ key: 'shield-1', w: 32, h: 32 });
  specs.push({ key: 'flag', w: 16, h: 16 });
  specs.push({ key: 'hud-life', w: 8, h: 8 });
  specs.push({ key: 'hud-enemy', w: 8, h: 8 });
  return specs;
}

export const SPRITE_KEYS = Object.freeze(spriteSpecs().map((s) => s.key));

const CELL = 32; // packing cell: every sprite fits a 32x32 slot
const COLS = 12;

/** Pure atlas geometry: key -> { sx, sy, sw, sh }. */
export function atlasLayout() {
  const map = new Map();
  spriteSpecs().forEach((spec, i) => {
    map.set(spec.key, {
      sx: (i % COLS) * CELL,
      sy: Math.floor(i / COLS) * CELL,
      sw: spec.w,
      sh: spec.h,
    });
  });
  return map;
}

export function atlasSize() {
  const n = spriteSpecs().length;
  return { width: COLS * CELL, height: Math.ceil(n / COLS) * CELL };
}

// ---------- drawing helpers ----------

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/**
 * Draw a 16x16 tank facing UP.
 * @param {string} hull main hull color
 * @param {string} dark tread/shadow color
 * @param {string} lite highlight color
 * @param {{ tier?: number, type?: string, frame: number }} v variant
 */
function drawTankUp(ctx, hull, dark, lite, v) {
  const f = v.frame;
  // Treads: two side columns with an alternating link pattern.
  px(ctx, 0, 1, 3, 14, dark);
  px(ctx, 13, 1, 3, 14, dark);
  for (let y = 1 + f; y < 15; y += 2) {
    px(ctx, 1, y, 1, 1, lite);
    px(ctx, 14, y, 1, 1, lite);
  }
  const type = v.type ?? 'player';
  if (type === 'fast') {
    // Slim scout hull.
    px(ctx, 5, 4, 6, 10, hull);
    px(ctx, 6, 5, 4, 3, lite);
    px(ctx, 7, 0, 2, 6, hull);
  } else if (type === 'power') {
    // Wide turret gunner.
    px(ctx, 4, 5, 8, 9, hull);
    px(ctx, 5, 6, 6, 4, lite);
    px(ctx, 6, 3, 4, 5, hull);
    px(ctx, 7, 0, 2, 5, dark);
  } else if (type === 'heavy') {
    // Bulky armored slab.
    px(ctx, 3, 2, 10, 12, hull);
    px(ctx, 4, 3, 8, 3, lite);
    px(ctx, 4, 10, 8, 3, dark);
    px(ctx, 7, 0, 2, 7, dark);
    px(ctx, 6, 6, 4, 4, dark);
  } else if (type === 'basic') {
    // Boxy grunt.
    px(ctx, 4, 4, 8, 10, hull);
    px(ctx, 5, 5, 6, 3, lite);
    px(ctx, 7, 0, 2, 6, hull);
  } else {
    // Player: tier silhouette progression.
    const tier = v.tier ?? 1;
    px(ctx, 4, 4, 8, 10, hull);
    px(ctx, 5, 5, 6, 3, lite);
    px(ctx, 6, 8, 4, 4, dark); // turret ring
    if (tier === 1) px(ctx, 7, 1, 2, 5, hull);
    if (tier === 2) px(ctx, 7, 0, 2, 6, hull); // longer barrel
    if (tier === 3) {
      px(ctx, 6, 0, 1, 6, hull); // twin barrels
      px(ctx, 9, 0, 1, 6, hull);
    }
    if (tier === 4) {
      px(ctx, 7, 0, 2, 6, lite); // hardened barrel
      px(ctx, 3, 3, 1, 11, lite); // armored skirt
      px(ctx, 12, 3, 1, 11, lite);
    }
  }
}

function drawPowerupIcon(ctx, type) {
  // Plaque.
  px(ctx, 0, 0, 16, 16, P.uiDark);
  px(ctx, 1, 1, 14, 14, P.uiGray);
  px(ctx, 1, 1, 14, 1, P.white);
  px(ctx, 1, 1, 1, 14, P.white);
  const icon = P.playerYellow;
  switch (type) {
    case 'star':
      px(ctx, 7, 3, 2, 10, icon);
      px(ctx, 3, 7, 10, 2, icon);
      px(ctx, 5, 5, 6, 6, icon);
      break;
    case 'grenade':
      px(ctx, 5, 6, 6, 7, P.uiDark);
      px(ctx, 7, 3, 2, 3, icon);
      px(ctx, 6, 7, 2, 2, P.white);
      break;
    case 'helmet':
      px(ctx, 4, 7, 8, 5, P.white);
      px(ctx, 5, 4, 6, 3, P.white);
      px(ctx, 6, 12, 4, 1, P.uiDark);
      break;
    case 'shovel':
      px(ctx, 7, 3, 2, 7, P.white);
      px(ctx, 5, 10, 6, 3, P.white);
      px(ctx, 6, 2, 4, 1, P.white);
      break;
    case 'stopwatch':
      px(ctx, 5, 5, 6, 7, P.white);
      px(ctx, 7, 3, 2, 2, P.white);
      px(ctx, 7, 7, 1, 3, P.uiDark);
      px(ctx, 8, 8, 2, 1, P.uiDark);
      break;
    case 'tank':
      px(ctx, 4, 8, 8, 4, icon);
      px(ctx, 6, 5, 4, 3, icon);
      px(ctx, 9, 3, 1, 3, icon);
      break;
    case 'pistol':
      px(ctx, 4, 5, 9, 3, P.white);
      px(ctx, 5, 8, 3, 5, P.white);
      px(ctx, 11, 8, 2, 1, P.uiDark);
      break;
  }
}

function drawEagle(ctx, destroyed) {
  if (destroyed) {
    // Rubble mound.
    px(ctx, 4, 20, 24, 10, P.uiGray);
    px(ctx, 8, 14, 8, 8, P.uiDark);
    px(ctx, 18, 16, 6, 6, P.uiDark);
    px(ctx, 12, 10, 5, 5, P.uiGray);
    return;
  }
  // Pedestal.
  px(ctx, 6, 26, 20, 4, P.uiGray);
  px(ctx, 8, 24, 16, 2, P.uiDark);
  // Body and wings.
  px(ctx, 12, 10, 8, 14, P.uiDark);
  px(ctx, 6, 12, 6, 8, P.uiDark);
  px(ctx, 20, 12, 6, 8, P.uiDark);
  px(ctx, 6, 12, 4, 2, P.white);
  px(ctx, 22, 12, 4, 2, P.white);
  // Head and beak.
  px(ctx, 13, 4, 6, 7, P.white);
  px(ctx, 19, 6, 3, 2, P.playerYellow);
  px(ctx, 15, 6, 1, 1, P.uiDark);
  // Emblem.
  px(ctx, 14, 16, 4, 4, P.alertRed);
}

function drawSprite(ctx, key, mk) {
  const [kind, a, b, c] = key.split('-');

  if (kind === 'player' || kind === 'enemy') {
    const dir = kind === 'player' ? b : b;
    const frame = Number(c);
    const variant =
      kind === 'player'
        ? { tier: Number(a.slice(1)), frame }
        : { type: a, frame };
    const hull = kind === 'player' ? P.playerYellow : P.enemySilver;
    const dark = P.uiDark;
    const lite = kind === 'player' ? P.white : P.steelHighlight;
    // Draw facing up on a temp canvas, then rotate into place.
    const temp = mk(16, 16);
    const tctx = temp.getContext('2d');
    drawTankUp(tctx, hull, dark, lite, variant);
    const angle = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[dir];
    ctx.save();
    ctx.translate(8, 8);
    ctx.rotate(angle);
    ctx.drawImage(temp, -8, -8);
    ctx.restore();
    return;
  }

  switch (key) {
    case 'terrain-brick-q':
      px(ctx, 0, 0, 8, 8, P.brickRust);
      px(ctx, 0, 3, 8, 1, P.brickMortar);
      px(ctx, 0, 7, 8, 1, P.brickMortar);
      px(ctx, 3, 0, 1, 3, P.brickMortar);
      px(ctx, 6, 4, 1, 3, P.brickMortar);
      break;
    case 'terrain-steel':
      px(ctx, 0, 0, 16, 16, P.steelGray);
      px(ctx, 0, 0, 16, 2, P.steelHighlight);
      px(ctx, 0, 0, 2, 16, P.steelHighlight);
      px(ctx, 14, 0, 2, 16, P.uiDark);
      px(ctx, 0, 14, 16, 2, P.uiDark);
      px(ctx, 5, 5, 6, 6, P.steelHighlight);
      break;
    case 'terrain-water-0':
    case 'terrain-water-1': {
      px(ctx, 0, 0, 16, 16, P.waterBlue);
      const off = key.endsWith('0') ? 0 : 4;
      for (let y = 2; y < 16; y += 5) {
        px(ctx, (y + off) % 8, y, 5, 1, P.waterHighlight);
        px(ctx, ((y + off) % 8) + 8, y + 2, 4, 1, P.waterHighlight);
      }
      break;
    }
    case 'terrain-ice':
      px(ctx, 0, 0, 16, 16, P.iceWhite);
      px(ctx, 2, 2, 4, 1, P.white);
      px(ctx, 10, 6, 4, 1, P.white);
      px(ctx, 4, 11, 5, 1, P.white);
      px(ctx, 12, 13, 3, 1, P.waterHighlight);
      break;
    case 'terrain-tree':
      px(ctx, 0, 0, 16, 16, P.treeGreen);
      for (const [x, y] of [ [2, 2], [9, 4], [4, 8], [11, 10], [6, 13] ]) {
        px(ctx, x, y, 3, 2, P.treeHighlight);
      }
      px(ctx, 13, 2, 2, 2, P.uiDark);
      px(ctx, 1, 12, 2, 2, P.uiDark);
      break;
    case 'eagle-intact':
      drawEagle(ctx, false);
      break;
    case 'eagle-destroyed':
      drawEagle(ctx, true);
      break;
    case 'flag':
      px(ctx, 3, 1, 1, 14, P.white);
      px(ctx, 4, 1, 9, 6, P.alertRed);
      px(ctx, 4, 3, 9, 1, P.white);
      break;
    case 'hud-life':
      px(ctx, 1, 2, 6, 5, P.playerYellow);
      px(ctx, 3, 0, 2, 3, P.playerYellow);
      break;
    case 'hud-enemy':
      px(ctx, 1, 2, 6, 5, P.uiDark);
      px(ctx, 3, 0, 2, 3, P.uiDark);
      break;
    default:
      if (kind === 'powerup') {
        drawPowerupIcon(ctx, a);
      } else if (kind === 'sparkle') {
        const step = Number(a);
        const r = 2 + step * 2;
        px(ctx, 8 - r / 2, 8 - r / 2, r, r, step % 2 ? P.white : P.playerYellow);
        px(ctx, 7, 8 - r, 2, 2, P.white);
        px(ctx, 7, 6 + r, 2, 2, P.white);
        px(ctx, 8 - r, 7, 2, 2, P.white);
        px(ctx, 6 + r, 7, 2, 2, P.white);
      } else if (kind === 'shield') {
        const phase = Number(a);
        ctx.fillStyle = P.white;
        for (let i = 0; i < 16; i++) {
          if ((i + phase) % 2 === 0) continue;
          const ang = (i / 16) * Math.PI * 2;
          const x = Math.round(15 + Math.cos(ang) * 14);
          const y = Math.round(15 + Math.sin(ang) * 14);
          ctx.fillRect(x, y, 2, 2);
        }
      }
      break;
  }
}

/**
 * Build the atlas. Inject createCanvas(w, h) for headless tests; the
 * default uses the DOM.
 */
export function createSpriteAtlas({ createCanvas } = {}) {
  const mk =
    createCanvas ??
    ((w, h) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      return canvas;
    });

  const layout = atlasLayout();
  const { width, height } = atlasSize();
  const canvas = mk(width, height);
  const ctx = canvas.getContext('2d');

  for (const [key, pos] of layout) {
    ctx.save();
    ctx.translate(pos.sx, pos.sy);
    drawSprite(ctx, key, mk);
    ctx.restore();
  }

  return {
    canvas,
    get(key) {
      const pos = layout.get(key);
      if (!pos) throw new Error(`unknown sprite: ${key}`);
      return pos;
    },
    keys() {
      return [...layout.keys()];
    },
  };
}
