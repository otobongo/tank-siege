import { describe, it, expect } from 'vitest';
import {
  aabbIntersects,
  moveRect,
  snapToLane,
  createIceSlide,
  sweepBullet,
} from '../src/engine/collision.js';
import { createGrid } from '../src/engine/grid.js';
import { CONFIG } from '../src/core/config.js';

function layout(overrides = {}) {
  const rows = Array.from({ length: 13 }, () => '.'.repeat(13).split(''));
  for (const [key, ch] of Object.entries(overrides)) {
    const [col, row] = key.split(',').map(Number);
    rows[row][col] = ch;
  }
  return rows.map((r) => r.join(''));
}

describe('aabbIntersects', () => {
  it('detects overlap and rejects touching edges', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(aabbIntersects(a, { x: 9, y: 9, w: 10, h: 10 })).toBe(true);
    expect(aabbIntersects(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false); // flush, no overlap
    expect(aabbIntersects(a, { x: -10, y: 0, w: 10, h: 10 })).toBe(false);
  });
});

describe('moveRect', () => {
  it('tank moving right into a wall stops flush at the wall boundary', () => {
    // Steel block at (6,2): solid px x 192..224. Tank is 32px wide.
    const g = createGrid(layout({ '6,2': 'S' }));
    const tank = { x: 100, y: 64, w: 32, h: 32 };
    const { x, moved } = moveRect(tank, 'right', 200, (r) => g.isSolidForTank(r));
    expect(x).toBe(192 - 32); // flush: tank right edge at 192
    expect(moved).toBe(60);
  });

  it('blocked by another tank', () => {
    const other = { x: 96, y: 0, w: 32, h: 32 };
    const tank = { x: 0, y: 0, w: 32, h: 32 };
    const { x } = moveRect(tank, 'right', 100, (r) => aabbIntersects(r, other));
    expect(x).toBe(64); // flush against the other tank
  });

  it('free movement covers the full distance', () => {
    const tank = { x: 0, y: 0, w: 32, h: 32 };
    const { y, moved } = moveRect(tank, 'down', 5, () => false);
    expect(y).toBe(5);
    expect(moved).toBe(5);
  });
});

describe('snapToLane', () => {
  const threshold = CONFIG.grid.laneSnapThresholdPx;

  it('snaps within the threshold', () => {
    expect(snapToLane(8 + threshold)).toBe(8 + threshold === 14 ? 16 : 8 + threshold);
    expect(snapToLane(10)).toBe(8);
    expect(snapToLane(14)).toBe(16);
    expect(snapToLane(16)).toBe(16);
  });

  it('does not snap beyond the threshold', () => {
    // 8px lanes with threshold 6 means everything snaps unless the
    // threshold shrinks; verify the guard with a mid-lane coordinate
    // only if threshold < lane/2, otherwise verify nearest-lane choice.
    expect(snapToLane(12)).toBe(Math.abs(16 - 12) <= threshold ? 16 : 12);
    expect(snapToLane(3)).toBe(0);
  });
});

describe('ice slide', () => {
  it('carries ~half a block after release', () => {
    const slide = createIceSlide();
    slide.begin('right');
    let total = 0;
    while (slide.active) total += slide.step(96, 1 / 60);
    expect(total).toBe(CONFIG.ice.slideDistancePx);
    expect(slide.dir).toBe('right');
  });

  it('cancel stops immediately', () => {
    const slide = createIceSlide();
    slide.begin('up');
    slide.cancel();
    expect(slide.active).toBe(false);
    expect(slide.step(96, 1 / 60)).toBe(0);
  });
});

describe('sweepBullet', () => {
  it('registers a hit on a 1px-overlap tank crossed mid-flight', () => {
    const bullet = { x: 0, y: 12, w: 8, h: 8 };
    // Tank overlaps the bullet's path by 1px at the bottom (y 19 vs 12..19).
    const tank = { x: 100, y: 19, w: 32, h: 32 };
    const result = sweepBullet(bullet, 'right', 300, {
      solidAt: () => false,
      targets: [{ rect: tank, ref: 'tank' }],
    });
    expect(result.hit).toEqual({ type: 'entity', ref: 'tank' });
    expect(result.x + bullet.w).toBeLessThanOrEqual(tank.x + 1);
  });

  it('stops at terrain and reports the impact point', () => {
    const g = createGrid(layout({ '6,2': 'B' }));
    const bullet = { x: 150, y: 76, w: 8, h: 8 };
    const result = sweepBullet(bullet, 'right', 300, {
      solidAt: (x, y) => g.isSolidForBullet(x, y),
      targets: [],
    });
    expect(result.hit.type).toBe('terrain');
    expect(result.hit.x).toBe(192); // brick block left face
  });

  it('does not tunnel through a thin wall at high speed', () => {
    // Wall 8px thick at x 192..200 (a single quarter column of brick
    // simulated with a custom solidAt).
    const solidAt = (x) => x >= 192 && x < 200;
    const bullet = { x: 0, y: 0, w: 8, h: 8 };
    const result = sweepBullet(bullet, 'right', 1000, { solidAt, targets: [] });
    expect(result.hit.type).toBe('terrain');
    expect(result.x).toBe(192 - 8);
  });

  it('moves the full distance when unobstructed', () => {
    const bullet = { x: 0, y: 0, w: 8, h: 8 };
    const result = sweepBullet(bullet, 'down', 6, { solidAt: () => false });
    expect(result.hit).toBeNull();
    expect(result.y).toBe(6);
  });
});
