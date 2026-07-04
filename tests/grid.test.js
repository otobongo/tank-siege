import { describe, it, expect } from 'vitest';
import { createGrid, TERRAIN, HIT } from '../src/engine/grid.js';

/** Build a 13x13 layout of '.' with named block overrides. */
function layout(overrides = {}) {
  const rows = Array.from({ length: 13 }, () => '.'.repeat(13).split(''));
  for (const [key, ch] of Object.entries(overrides)) {
    const [col, row] = key.split(',').map(Number);
    rows[row][col] = ch;
  }
  return rows.map((r) => r.join(''));
}

/**
 * Simulate a bullet flying from (x, y) in `dir` until it hits something
 * solid, then apply damage there. Mirrors what bullets.js will do.
 */
function shoot(grid, x, y, dir, depth = 1, opts = {}) {
  const step = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  for (let i = 0; i < 500; i++) {
    if (grid.isSolidForBullet(x, y)) {
      return grid.applyBulletDamage(x, y, dir, depth, opts);
    }
    x += step[0];
    y += step[1];
  }
  return HIT.NONE;
}

describe('grid parsing', () => {
  it('expands blocks to the right resolutions', () => {
    const g = createGrid(
      layout({ '2,2': 'B', '4,4': 'S', '6,6': 'W', '8,8': 'I', '10,10': 'T' })
    );
    // Brick block (2,2) -> quarters 8..11 x 8..11 set, half cells stay empty.
    expect(g.brickQuarterAt(8, 8)).toBe(true);
    expect(g.brickQuarterAt(11, 11)).toBe(true);
    expect(g.brickQuarterAt(7, 8)).toBe(false);
    expect(g.brickQuarterAt(12, 8)).toBe(false);
    // Steel block (4,4) -> half cells 8..9 x 8..9.
    expect(g.halfCellAt(8, 8)).toBe(TERRAIN.STEEL);
    expect(g.halfCellAt(9, 9)).toBe(TERRAIN.STEEL);
    expect(g.halfCellAt(10, 8)).toBe(TERRAIN.EMPTY);
    expect(g.halfCellAt(12, 12)).toBe(TERRAIN.WATER);
    expect(g.halfCellAt(16, 16)).toBe(TERRAIN.ICE);
    expect(g.halfCellAt(20, 20)).toBe(TERRAIN.TREE);
  });

  it('rejects malformed layouts', () => {
    expect(() => createGrid(['...'])).toThrow();
    expect(() => createGrid(layout({ '0,0': 'X' }))).toThrow();
  });

  it('injects base and shield ring', () => {
    const g = createGrid(layout());
    // Eagle at block (6,12) -> half cells 12..13 x 24..25.
    expect(g.halfCellAt(12, 24)).toBe(TERRAIN.BASE);
    expect(g.halfCellAt(13, 25)).toBe(TERRAIN.BASE);
    // Ring block (5,11) -> quarters 20..23 x 44..47 are brick.
    expect(g.brickQuarterAt(20, 44)).toBe(true);
    expect(g.brickQuarterAt(23, 47)).toBe(true);
    expect(g.baseRect).toEqual({ x: 192, y: 384, w: 32, h: 32 });
  });
});

describe('bullet damage', () => {
  // Brick block at (6,2): px x 192..224, y 64..96. Shoot rightward along
  // the block's vertical center from open ground to its left.
  const BX = 192;
  const BY = 80;

  it('4 same-column hits fully breach one block; 3 do not', () => {
    const g = createGrid(layout({ '6,2': 'B' }));
    const blockRect = { x: BX, y: 64, w: 32, h: 32 };

    for (let shotIdx = 0; shotIdx < 3; shotIdx++) {
      expect(shoot(g, BX - 40, BY, 'right', 1)).toBe(HIT.BRICK);
    }
    expect(g.isSolidForTank(blockRect)).toBe(true); // 3 shots: not breached

    expect(shoot(g, BX - 40, BY, 'right', 1)).toBe(HIT.BRICK);
    expect(g.isSolidForTank(blockRect)).toBe(false); // 4th shot: breached
    // A follow-up shot sails through the hole and dies on the far edge.
    expect(shoot(g, BX - 40, BY, 'right', 1)).toBe(HIT.EDGE);
  });

  it('tier-4 depth breaches in 2 hits', () => {
    const g = createGrid(layout({ '6,2': 'B' }));
    const blockRect = { x: BX, y: 64, w: 32, h: 32 };
    expect(shoot(g, BX - 40, BY, 'right', 2)).toBe(HIT.BRICK);
    expect(g.isSolidForTank(blockRect)).toBe(true);
    expect(shoot(g, BX - 40, BY, 'right', 2)).toBe(HIT.BRICK);
    expect(g.isSolidForTank(blockRect)).toBe(false);
  });

  it('steel absorbs normal shots and falls to tier-4 shots', () => {
    const g = createGrid(layout({ '6,2': 'S' }));
    expect(shoot(g, BX - 40, BY, 'right', 1)).toBe(HIT.STEEL);
    expect(g.halfCellAt(12, 4)).toBe(TERRAIN.STEEL); // undamaged

    expect(shoot(g, BX - 40, BY, 'right', 2, { destroySteel: true })).toBe(HIT.STEEL);
    // The struck half-cell (left column, at bullet row) is gone.
    expect(g.halfCellAt(12, 5)).toBe(TERRAIN.EMPTY);
  });

  it('vertical shots work symmetrically', () => {
    // Brick block at (2,6): px x 64..96, y 192..224. Shoot downward.
    const g = createGrid(layout({ '2,6': 'B' }));
    for (let shotIdx = 0; shotIdx < 4; shotIdx++) {
      expect(shoot(g, 80, 150, 'down', 1)).toBe(HIT.BRICK);
    }
    expect(g.isSolidForTank({ x: 64, y: 192, w: 32, h: 32 })).toBe(false);
  });

  it('hitting the base returns HIT.BASE', () => {
    const g = createGrid(layout());
    // Fire down the open column above the eagle (ring covers its sides,
    // not the column above? it does: block (6,11) is ring). Remove ring
    // first by shooting through it, then confirm base hit.
    let result;
    for (let i = 0; i < 20; i++) {
      result = shoot(g, 208, 300, 'down', 1);
      if (result !== HIT.BRICK) break;
    }
    expect(result).toBe(HIT.BASE);
  });

  it('field edge returns HIT.EDGE', () => {
    const g = createGrid(layout());
    expect(shoot(g, 100, 20, 'up', 1)).toBe(HIT.EDGE);
  });

  it('reports dirty tiles once', () => {
    const g = createGrid(layout({ '6,2': 'B' }));
    g.consumeDirtyTiles(); // clear any injection dirt
    shoot(g, BX - 40, BY, 'right', 1);
    const tiles = g.consumeDirtyTiles();
    expect(tiles.length).toBeGreaterThan(0);
    expect(g.consumeDirtyTiles()).toHaveLength(0);
  });
});

describe('base ring (Shovel)', () => {
  it('fortifyBase(true) then repairBaseRing() restores pristine brick', () => {
    const g = createGrid(layout());
    g.fortifyBase(true);
    expect(g.halfCellAt(10, 22)).toBe(TERRAIN.STEEL); // ring block (5,11)
    expect(g.brickQuarterAt(20, 44)).toBe(false);

    g.repairBaseRing();
    expect(g.halfCellAt(10, 22)).toBe(TERRAIN.EMPTY);
    for (let q = 20; q < 24; q++) {
      expect(g.brickQuarterAt(q, 44)).toBe(true);
    }
  });

  it('repair restores ring damaged by bullets', () => {
    const g = createGrid(layout());
    // Chew a hole in the ring's top-center block (6,11).
    shoot(g, 208, 300, 'down', 1);
    expect(g.brickQuarterAt(25, 44)).toBe(false);
    g.repairBaseRing();
    expect(g.brickQuarterAt(25, 44)).toBe(true);
  });
});

describe('terrain queries', () => {
  it('classifies tank passability', () => {
    const g = createGrid(
      layout({ '2,2': 'B', '4,2': 'S', '6,2': 'W', '8,2': 'I', '10,2': 'T' })
    );
    const rectAtBlock = (c, r) => ({ x: c * 32, y: r * 32, w: 32, h: 32 });
    expect(g.isSolidForTank(rectAtBlock(2, 2))).toBe(true); // brick
    expect(g.isSolidForTank(rectAtBlock(4, 2))).toBe(true); // steel
    expect(g.isSolidForTank(rectAtBlock(6, 2))).toBe(true); // water
    expect(g.isSolidForTank(rectAtBlock(8, 2))).toBe(false); // ice passable
    expect(g.isSolidForTank(rectAtBlock(10, 2))).toBe(false); // trees passable
    expect(g.isSolidForTank(rectAtBlock(0, 0))).toBe(false); // empty
    expect(g.isSolidForTank({ x: -1, y: 0, w: 32, h: 32 })).toBe(true); // edge
    expect(g.isIce(rectAtBlock(8, 2))).toBe(true);
    expect(g.isTree(rectAtBlock(10, 2))).toBe(true);
  });

  it('bullets pass over water but not brick/steel', () => {
    const g = createGrid(layout({ '2,2': 'B', '4,2': 'S', '6,2': 'W' }));
    expect(g.isSolidForBullet(80, 80)).toBe(true); // brick
    expect(g.isSolidForBullet(144, 80)).toBe(true); // steel
    expect(g.isSolidForBullet(208, 80)).toBe(false); // water
    expect(g.isSolidForBullet(-1, 80)).toBe(true); // edge
  });
});
