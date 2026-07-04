/**
 * Terrain grid: parse, expand, quarter-cell brick damage.
 *
 * Three resolutions (see plan section 2):
 *   13x13 blocks   - stage authoring
 *   26x26 half     - movement/collision terrain (steel, water, ice, trees, base)
 *   52x52 quarter  - brick damage bitmask
 *
 * All coordinates in the query APIs are playfield-local pixels
 * (0..416). Rects are { x, y, w, h } and treated as half-open
 * ranges [x, x+w).
 *
 * Public interface (owned by TS-004):
 *   TERRAIN, HIT enums
 *   createGrid(layoutRows) -> {
 *     applyBulletDamage(x, y, dir, depth, opts) -> HIT value
 *     isSolidForTank(rect), isSolidForBullet(x, y),
 *     isIce(rect), isTree(rect),
 *     fortifyBase(steel), repairBaseRing(),
 *     consumeDirtyTiles() -> [{ qc, qr }],
 *     halfCellAt(hc, hr), brickQuarterAt(qc, qr),
 *     baseRect, ringBlocks
 *   }
 */

import { CONFIG } from '../core/config.js';

export const TERRAIN = Object.freeze({
  EMPTY: '.',
  BRICK: 'B',
  STEEL: 'S',
  WATER: 'W',
  ICE: 'I',
  TREE: 'T',
  BASE: 'E', // engine-injected eagle, never appears in stage files
});

export const HIT = Object.freeze({
  NONE: 'none',
  BRICK: 'brick',
  STEEL: 'steel',
  EDGE: 'edge',
  BASE: 'base',
});

const { blocks: BLOCKS, halfCells: HALF, quarterCells: QUARTER, quarterCellPx: QPX, halfCellPx: HPX } =
  CONFIG.grid;
const FIELD_PX = CONFIG.canvas.playfieldWidth;

// Base (eagle) occupies the bottom-center block; the shield ring is the
// five blocks wrapping it against the bottom edge.
const BASE_BLOCK = Object.freeze({ col: 6, row: 12 });
const RING_BLOCKS = Object.freeze([
  { col: 5, row: 11 },
  { col: 6, row: 11 },
  { col: 7, row: 11 },
  { col: 5, row: 12 },
  { col: 7, row: 12 },
]);

const DIRS = Object.freeze({
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
});

/**
 * @param {string[]} layoutRows 13 strings x 13 chars from a stage file
 *   (alphabet {. B S W I T}; base and ring are injected here, never
 *   encoded in the stage).
 */
export function createGrid(layoutRows) {
  if (!Array.isArray(layoutRows) || layoutRows.length !== BLOCKS) {
    throw new Error(`layout must be ${BLOCKS} rows`);
  }

  // 26x26 terrain chars; brick lives only in the quarter mask.
  const half = new Array(HALF * HALF).fill(TERRAIN.EMPTY);
  // 52x52 brick presence.
  const brick = new Uint8Array(QUARTER * QUARTER);
  const dirty = new Set(); // quarter-cell indices touched since last consume

  function setBlock(col, row, ch) {
    if (ch === TERRAIN.BRICK) {
      for (let qr = row * 4; qr < row * 4 + 4; qr++) {
        for (let qc = col * 4; qc < col * 4 + 4; qc++) {
          brick[qr * QUARTER + qc] = 1;
        }
      }
    } else if (ch !== TERRAIN.EMPTY) {
      for (let hr = row * 2; hr < row * 2 + 2; hr++) {
        for (let hc = col * 2; hc < col * 2 + 2; hc++) {
          half[hr * HALF + hc] = ch;
        }
      }
    }
  }

  function clearBlock(col, row) {
    for (let qr = row * 4; qr < row * 4 + 4; qr++) {
      for (let qc = col * 4; qc < col * 4 + 4; qc++) {
        brick[qr * QUARTER + qc] = 0;
      }
    }
    for (let hr = row * 2; hr < row * 2 + 2; hr++) {
      for (let hc = col * 2; hc < col * 2 + 2; hc++) {
        half[hr * HALF + hc] = TERRAIN.EMPTY;
      }
    }
  }

  function markBlockDirty(col, row) {
    for (let qr = row * 4; qr < row * 4 + 4; qr++) {
      for (let qc = col * 4; qc < col * 4 + 4; qc++) {
        dirty.add(qr * QUARTER + qc);
      }
    }
  }

  // Parse stage layout.
  for (let row = 0; row < BLOCKS; row++) {
    const line = layoutRows[row];
    if (typeof line !== 'string' || line.length !== BLOCKS) {
      throw new Error(`layout row ${row} must be ${BLOCKS} chars`);
    }
    for (let col = 0; col < BLOCKS; col++) {
      const ch = line[col];
      if (!'.BSWIT'.includes(ch)) {
        throw new Error(`invalid terrain '${ch}' at ${col},${row}`);
      }
      setBlock(col, row, ch);
    }
  }

  // Inject base + pristine brick ring (overwrites whatever the stage had;
  // validated stages keep this area empty anyway).
  clearBlock(BASE_BLOCK.col, BASE_BLOCK.row);
  setBlock(BASE_BLOCK.col, BASE_BLOCK.row, TERRAIN.BASE);
  for (const { col, row } of RING_BLOCKS) {
    clearBlock(col, row);
    setBlock(col, row, TERRAIN.BRICK);
  }

  function inField(x, y) {
    return x >= 0 && y >= 0 && x < FIELD_PX && y < FIELD_PX;
  }

  function halfAtPx(x, y) {
    return half[Math.floor(y / HPX) * HALF + Math.floor(x / HPX)];
  }

  function brickAtPx(x, y) {
    return brick[Math.floor(y / QPX) * QUARTER + Math.floor(x / QPX)] === 1;
  }

  /** Iterate quarter cells intersecting a px rect (half-open). */
  function* quartersIn(rect) {
    const qc0 = Math.max(0, Math.floor(rect.x / QPX));
    const qr0 = Math.max(0, Math.floor(rect.y / QPX));
    const qc1 = Math.min(QUARTER - 1, Math.ceil((rect.x + rect.w) / QPX) - 1);
    const qr1 = Math.min(QUARTER - 1, Math.ceil((rect.y + rect.h) / QPX) - 1);
    for (let qr = qr0; qr <= qr1; qr++) {
      for (let qc = qc0; qc <= qc1; qc++) yield qr * QUARTER + qc;
    }
  }

  /** Iterate half cells intersecting a px rect (half-open). */
  function* halvesIn(rect) {
    const hc0 = Math.max(0, Math.floor(rect.x / HPX));
    const hr0 = Math.max(0, Math.floor(rect.y / HPX));
    const hc1 = Math.min(HALF - 1, Math.ceil((rect.x + rect.w) / HPX) - 1);
    const hr1 = Math.min(HALF - 1, Math.ceil((rect.y + rect.h) / HPX) - 1);
    for (let hr = hr0; hr <= hr1; hr++) {
      for (let hc = hc0; hc <= hc1; hc++) yield hr * HALF + hc;
    }
  }

  function setRing(terrain) {
    for (const { col, row } of RING_BLOCKS) {
      clearBlock(col, row);
      setBlock(col, row, terrain);
      markBlockDirty(col, row);
    }
  }

  return {
    /** Eagle bounds in px, for collision and rendering. */
    baseRect: Object.freeze({
      x: BASE_BLOCK.col * 2 * HPX,
      y: BASE_BLOCK.row * 2 * HPX,
      w: 2 * HPX,
      h: 2 * HPX,
    }),

    ringBlocks: RING_BLOCKS,

    halfCellAt(hc, hr) {
      return half[hr * HALF + hc];
    },

    brickQuarterAt(qc, qr) {
      return brick[qr * QUARTER + qc] === 1;
    },

    /**
     * Apply a bullet impact at px point (x, y) traveling in `dir`.
     * Removes a swath of brick 4 quarters wide (perpendicular to
     * travel) and `depth` quarters deep (along travel), centered on the
     * bullet's perpendicular coordinate.
     *
     * @param {number} x impact point px
     * @param {number} y impact point px
     * @param {'up'|'down'|'left'|'right'} dir bullet travel direction
     * @param {number} depth quarters removed along travel
     * @param {{ destroySteel?: boolean }} [opts] tier-4 behavior
     * @returns {string} HIT value describing what was struck
     */
    applyBulletDamage(x, y, dir, depth, { destroySteel = false } = {}) {
      if (!DIRS[dir]) throw new Error(`bad dir: ${dir}`);
      if (!inField(x, y)) return HIT.EDGE;

      // Base check first: any hit on the eagle is game over.
      if (halfAtPx(x, y) === TERRAIN.BASE) return HIT.BASE;

      const { dx, dy } = DIRS[dir];
      const qx = Math.floor(x / QPX);
      const qy = Math.floor(y / QPX);

      // Swath cells: 4 wide perpendicular, `depth` deep along travel.
      const cells = [];
      for (let d = 0; d < depth; d++) {
        for (let wOff = -2; wOff < 2; wOff++) {
          // Center the 4-wide swath on the bullet's perpendicular coord.
          const perpBase = dx !== 0 ? Math.round(y / QPX) : Math.round(x / QPX);
          const qc = dx !== 0 ? qx + dx * d : perpBase + wOff;
          const qr = dx !== 0 ? perpBase + wOff : qy + dy * d;
          if (qc >= 0 && qc < QUARTER && qr >= 0 && qr < QUARTER) {
            cells.push({ qc, qr });
          }
        }
      }

      // Classify the impact layer (d = 0 slice) before damaging.
      const px = { x: qx * QPX + QPX / 2, y: qy * QPX + QPX / 2 };
      const terrainHere = halfAtPx(px.x, px.y);

      if (terrainHere === TERRAIN.STEEL) {
        if (!destroySteel) return HIT.STEEL;
        // Destroy the steel half-cell that was struck.
        const hc = Math.floor(x / HPX);
        const hr = Math.floor(y / HPX);
        half[hr * HALF + hc] = TERRAIN.EMPTY;
        for (let qr = hr * 2; qr < hr * 2 + 2; qr++) {
          for (let qc = hc * 2; qc < hc * 2 + 2; qc++) dirty.add(qr * QUARTER + qc);
        }
        return HIT.STEEL;
      }

      let hitBrick = false;
      for (const { qc, qr } of cells) {
        const idx = qr * QUARTER + qc;
        if (brick[idx]) {
          brick[idx] = 0;
          dirty.add(idx);
          hitBrick = true;
        }
      }
      return hitBrick ? HIT.BRICK : HIT.NONE;
    },

    /** Terrain a tank cannot enter: field edges, brick, steel, water, base. */
    isSolidForTank(rect) {
      if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > FIELD_PX || rect.y + rect.h > FIELD_PX) {
        return true;
      }
      for (const idx of halvesIn(rect)) {
        const t = half[idx];
        if (t === TERRAIN.STEEL || t === TERRAIN.WATER || t === TERRAIN.BASE) return true;
      }
      for (const idx of quartersIn(rect)) {
        if (brick[idx]) return true;
      }
      return false;
    },

    /** Terrain that stops a bullet at px point: edge, brick, steel, base. */
    isSolidForBullet(x, y) {
      if (!inField(x, y)) return true;
      const t = halfAtPx(x, y);
      if (t === TERRAIN.STEEL || t === TERRAIN.BASE) return true;
      return brickAtPx(x, y);
    },

    /** True when the rect's center sits on ice. */
    isIce(rect) {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      return inField(cx, cy) && halfAtPx(cx, cy) === TERRAIN.ICE;
    },

    /** True when the rect's center sits under tree canopy. */
    isTree(rect) {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      return inField(cx, cy) && halfAtPx(cx, cy) === TERRAIN.TREE;
    },

    /**
     * Shovel support. fortifyBase(true) turns the ring to steel;
     * fortifyBase(false) reverts it to repaired brick.
     */
    fortifyBase(steel) {
      setRing(steel ? TERRAIN.STEEL : TERRAIN.BRICK);
    },

    /** Restore the ring to a pristine brick state (also clears steel). */
    repairBaseRing() {
      setRing(TERRAIN.BRICK);
    },

    /**
     * Renderer contract: quarter cells whose appearance changed since
     * the last call. Returns [{ qc, qr }] and clears the set.
     */
    consumeDirtyTiles() {
      const tiles = [...dirty].map((idx) => ({
        qc: idx % QUARTER,
        qr: Math.floor(idx / QUARTER),
      }));
      dirty.clear();
      return tiles;
    },
  };
}
