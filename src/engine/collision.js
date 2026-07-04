/**
 * AABB vs grid, entity vs entity, lane snapping, ice physics.
 *
 * Movement is axis-locked (no sliding along walls) and resolved in
 * whole pixels: entities move 1px at a time and stop flush against the
 * first blocked position. Fractional speeds are the caller's problem
 * (tank.js banks sub-pixel remainders).
 *
 * Public interface (owned by TS-005):
 *   DIR_VECTORS, PERPENDICULAR
 *   aabbIntersects(a, b)
 *   moveRect(rect, dir, dist, isBlocked) -> { x, y, moved }
 *   snapToLane(coord) -> snapped coord (lane + threshold from CONFIG)
 *   createIceSlide() -> { begin(dir), step(speed, dt), active, cancel() }
 *   sweepBullet(rect, dir, dist, { solidAt, targets }) -> sweep result
 */

import { CONFIG } from '../core/config.js';

export const DIR_VECTORS = Object.freeze({
  up: Object.freeze({ dx: 0, dy: -1 }),
  down: Object.freeze({ dx: 0, dy: 1 }),
  left: Object.freeze({ dx: -1, dy: 0 }),
  right: Object.freeze({ dx: 1, dy: 0 }),
});

/** Axis a direction moves along: 'x' or 'y'. */
export const DIR_AXIS = Object.freeze({
  up: 'y',
  down: 'y',
  left: 'x',
  right: 'x',
});

export function aabbIntersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Move a rect up to `dist` px in `dir`, stopping flush at the first
 * position where isBlocked(candidateRect) is true. Whole-pixel steps.
 *
 * @param {{x,y,w,h}} rect starting bounds (not mutated)
 * @param {'up'|'down'|'left'|'right'} dir
 * @param {number} dist pixels to attempt (whole number)
 * @param {(rect) => boolean} isBlocked terrain + entity blocking test
 * @returns {{ x: number, y: number, moved: number }}
 */
export function moveRect(rect, dir, dist, isBlocked) {
  const { dx, dy } = DIR_VECTORS[dir];
  let { x, y } = rect;
  let moved = 0;
  const whole = Math.floor(dist);
  for (let i = 0; i < whole; i++) {
    const candidate = { x: x + dx, y: y + dy, w: rect.w, h: rect.h };
    if (isBlocked(candidate)) break;
    x = candidate.x;
    y = candidate.y;
    moved++;
  }
  return { x, y, moved };
}

/**
 * Snap a perpendicular coordinate to the nearest movement lane when a
 * tank turns 90 degrees, so corridors don't require pixel-hunting.
 * Returns the original coordinate when the nearest lane is farther
 * than the snap threshold.
 */
export function snapToLane(coord) {
  const lane = CONFIG.grid.lanePx;
  const snapped = Math.round(coord / lane) * lane;
  return Math.abs(snapped - coord) <= CONFIG.grid.laneSnapThresholdPx ? snapped : coord;
}

/**
 * Ice slide state. When movement input releases on ice, the tank keeps
 * moving in its last direction for ~half a block, then stops. Hitting
 * a wall cancels the slide (moveRect just stops moving).
 */
export function createIceSlide() {
  let dir = null;
  let remaining = 0;
  return {
    get active() {
      return remaining > 0;
    },
    get dir() {
      return dir;
    },
    /** Arm the slide in the tank's travel direction. */
    begin(travelDir) {
      dir = travelDir;
      remaining = CONFIG.ice.slideDistancePx;
    },
    cancel() {
      remaining = 0;
    },
    /**
     * Advance the slide. Returns whole pixels to move this step.
     * @param {number} speed tank speed px/s
     * @param {number} dt seconds
     */
    step(speed, dt) {
      if (remaining <= 0) return 0;
      const px = Math.min(remaining, Math.max(1, Math.round(speed * dt)));
      remaining -= px;
      return px;
    },
  };
}

/**
 * Swept bullet movement: advance a bullet rect 1px at a time so fast
 * bullets cannot tunnel through thin targets or walls.
 *
 * Terrain is sampled at the bullet's leading edge (both corners plus
 * center, catching 8px brick quarters on either side of the nose).
 *
 * @param {{x,y,w,h}} rect bullet bounds (not mutated)
 * @param {'up'|'down'|'left'|'right'} dir
 * @param {number} dist pixels to attempt this step
 * @param {{ solidAt: (x, y) => boolean,
 *           targets: Array<{ rect: {x,y,w,h}, ref: any }> }} world
 * @returns {{ x: number, y: number, moved: number,
 *             hit: null
 *                | { type: 'terrain', x: number, y: number }
 *                | { type: 'entity', ref: any } }}
 */
export function sweepBullet(rect, dir, dist, { solidAt, targets = [] }) {
  const { dx, dy } = DIR_VECTORS[dir];
  let { x, y } = rect;
  let moved = 0;

  const leadPoints = (bx, by) => {
    const right = bx + rect.w - 1;
    const bottom = by + rect.h - 1;
    const cx = bx + rect.w / 2;
    const cy = by + rect.h / 2;
    switch (dir) {
      case 'up':
        return [ [bx, by], [cx, by], [right, by] ];
      case 'down':
        return [ [bx, bottom], [cx, bottom], [right, bottom] ];
      case 'left':
        return [ [bx, by], [bx, cy], [bx, bottom] ];
      case 'right':
        return [ [right, by], [right, cy], [right, bottom] ];
    }
  };

  const whole = Math.ceil(dist);
  for (let i = 0; i < whole; i++) {
    const nx = x + dx;
    const ny = y + dy;
    const candidate = { x: nx, y: ny, w: rect.w, h: rect.h };

    for (const t of targets) {
      if (aabbIntersects(candidate, t.rect)) {
        return { x, y, moved, hit: { type: 'entity', ref: t.ref } };
      }
    }
    for (const [px, py] of leadPoints(nx, ny)) {
      if (solidAt(px, py)) {
        return { x, y, moved, hit: { type: 'terrain', x: px, y: py } };
      }
    }
    x = nx;
    y = ny;
    moved++;
  }
  return { x, y, moved, hit: null };
}
