/**
 * Per-type enemy AI controllers and heavy-tank pathfinding.
 *
 * All controllers share a decision tick (~CONFIG.ai.decisionInterval,
 * re-decided early when blocked). Personalities (plan TS-012):
 *   basic - random walk with downward bias; random fire cadence, and
 *           always fires when a player or the base is in line-of-fire
 *   fast  - runs to the emptier flank column, then descends;
 *           opportunistic fire only (line-of-fire)
 *   power - basic behavior with a higher fire rate; prefers the lane
 *           with the longest line of sight
 *   heavy - coarse A* on the 26x26 half-cell grid toward the base
 *           (bricks passable at a cost - it shoots through), replanned
 *           every ~2s or when blocked; fires at obstructing bricks
 *
 * Decoy pressure: with >= 3 enemies on field, at least one holds the
 * 'base' attacker role (reassigned on death); the rest default to
 * 'player' pressure.
 *
 * Determinism: all randomness flows through an injected seeded RNG
 * (createRng); given the same seed and world, decisions replay exactly.
 * Stopwatch freeze gates the decision tick entirely.
 *
 * Public interface (owned by TS-012):
 *   createRng(seed) -> () => [0,1)
 *   findPath(grid, startHc, startHr, goals) -> [{hc,hr}] | null
 *   createAI({ grid, rng }) -> {
 *     register(enemy), unregister(enemy), roleOf(enemy),
 *     update(dt, world)
 *   }
 *   world = { playerRects: [{x,y,w,h}], baseRect,
 *             blockersFor(enemy) -> rects, fire(request) }
 */

import { CONFIG } from '../core/config.js';
import { DIR_VECTORS } from '../engine/collision.js';
import { TERRAIN } from '../engine/grid.js';

const HALF = CONFIG.grid.halfCells;
const HPX = CONFIG.grid.halfCellPx;
const FIELD_PX = CONFIG.canvas.playfieldWidth;

/** Deterministic mulberry32 PRNG. */
export function createRng(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const BRICK_COST = 5; // heavies prefer open lanes but will chew walls

/** Cost for a tank (2x2 half-cells) whose top-left sits at (hc, hr). */
function nodeCost(grid, hc, hr) {
  if (hc < 0 || hr < 0 || hc > HALF - 2 || hr > HALF - 2) return Infinity;
  let cost = 1;
  for (let r = hr; r < hr + 2; r++) {
    for (let c = hc; c < hc + 2; c++) {
      const t = grid.halfCellAt(c, r);
      if (t === TERRAIN.STEEL || t === TERRAIN.WATER || t === TERRAIN.BASE) return Infinity;
      // Brick presence at half-cell = any of its 4 quarters standing.
      const qc = c * 2;
      const qr = r * 2;
      if (
        grid.brickQuarterAt(qc, qr) ||
        grid.brickQuarterAt(qc + 1, qr) ||
        grid.brickQuarterAt(qc, qr + 1) ||
        grid.brickQuarterAt(qc + 1, qr + 1)
      ) {
        cost = Math.max(cost, BRICK_COST);
      }
    }
  }
  return cost;
}

/**
 * A* over half-cell top-left positions. Small grid, plain arrays.
 * @param {object} grid TS-004 grid
 * @param {number} startHc @param {number} startHr
 * @param {Array<{hc,hr}>} goals
 * @returns {Array<{hc,hr}>|null} path including start and goal
 */
export function findPath(grid, startHc, startHr, goals) {
  const idx = (c, r) => r * HALF + c;
  const open = new Map(); // idx -> f
  const gScore = new Map();
  const from = new Map();
  const goalSet = new Set(goals.map((g) => idx(g.hc, g.hr)));
  const h = (c, r) =>
    Math.min(...goals.map((g) => Math.abs(g.hc - c) + Math.abs(g.hr - r)));

  const start = idx(startHc, startHr);
  gScore.set(start, 0);
  open.set(start, h(startHc, startHr));

  while (open.size > 0) {
    let currentIdx = -1;
    let bestF = Infinity;
    for (const [i, f] of open) {
      if (f < bestF) {
        bestF = f;
        currentIdx = i;
      }
    }
    open.delete(currentIdx);
    const cc = currentIdx % HALF;
    const cr = Math.floor(currentIdx / HALF);

    if (goalSet.has(currentIdx)) {
      const path = [];
      let node = currentIdx;
      while (node !== undefined) {
        path.unshift({ hc: node % HALF, hr: Math.floor(node / HALF) });
        node = from.get(node);
      }
      return path;
    }

    for (const { dx, dy } of Object.values(DIR_VECTORS)) {
      const nc = cc + dx;
      const nr = cr + dy;
      const cost = nodeCost(grid, nc, nr);
      if (cost === Infinity) continue;
      const ni = idx(nc, nr);
      const tentative = gScore.get(currentIdx) + cost;
      if (tentative < (gScore.get(ni) ?? Infinity)) {
        gScore.set(ni, tentative);
        from.set(ni, currentIdx);
        open.set(ni, tentative + h(nc, nr));
      }
    }
  }
  return null;
}

/** Goal nodes: tank positions hugging the eagle (through the ring). */
function baseGoals() {
  return [
    { hc: 12, hr: 22 }, // on the ring's top block, above the eagle
    { hc: 10, hr: 24 }, // flush left of the eagle
    { hc: 14, hr: 24 }, // flush right of the eagle
  ];
}

/**
 * Ray from the tank's muzzle along its facing. Returns 'player',
 * 'base', or null for what the shot would hit first.
 */
function lineOfFire(grid, enemy, world) {
  const { dx, dy } = DIR_VECTORS[enemy.tank.facing];
  let x = enemy.rect.x + enemy.rect.w / 2;
  let y = enemy.rect.y + enemy.rect.h / 2;
  for (let i = 0; i < FIELD_PX / 4; i++) {
    x += dx * 4;
    y += dy * 4;
    if (x < 0 || y < 0 || x >= FIELD_PX || y >= FIELD_PX) return null;
    for (const rect of world.playerRects) {
      if (x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h) {
        return 'player';
      }
    }
    const b = world.baseRect;
    if (b && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return 'base';
    if (grid.isSolidForBullet(x, y)) return null;
  }
  return null;
}

const RANDOM_FIRE_CHANCE = { basic: 0.3, fast: 0, power: 0.6, heavy: 0.25 };

export function createAI({ grid, rng }) {
  /** @type {Map<object, object>} enemy -> controller state */
  const units = new Map();

  function makeCtrl() {
    return {
      role: 'player', // 'player' | 'base'
      dir: 'down',
      decisionTimer: 0,
      replanTimer: 0,
      path: null,
      pathStep: 0,
      wantsRandomFire: false,
    };
  }

  function aliveUnits() {
    return [...units.entries()].filter(([e]) => !e.dead);
  }

  /** Keep >= 1 base attacker whenever >= 3 enemies hold the field. */
  function assignRoles() {
    const alive = aliveUnits();
    if (alive.length < CONFIG.ai.baseAttackerThreshold) return;
    if (alive.some(([, c]) => c.role === 'base')) return;
    // Heavies make the scariest base attackers; otherwise seeded pick.
    const heavy = alive.find(([e]) => e.type === 'heavy');
    const [, ctrl] = heavy ?? alive[Math.floor(rng() * alive.length)];
    ctrl.role = 'base';
    ctrl.path = null; // replan for the new objective
  }

  function halfPos(enemy) {
    return {
      hc: Math.round(enemy.rect.x / HPX),
      hr: Math.round(enemy.rect.y / HPX),
    };
  }

  function dirToward(fromPos, to) {
    if (to.hc > fromPos.hc) return 'right';
    if (to.hc < fromPos.hc) return 'left';
    if (to.hr > fromPos.hr) return 'down';
    if (to.hr < fromPos.hr) return 'up';
    return null;
  }

  function weightedDir(weights) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let roll = rng() * total;
    for (const [dir, w] of Object.entries(weights)) {
      roll -= w;
      if (roll <= 0) return dir;
    }
    return 'down';
  }

  function decideBasicLike(enemy, ctrl, world, fireChance) {
    if (ctrl.role === 'base') {
      // Head for the base: bias by where it is.
      const b = world.baseRect;
      const cx = enemy.rect.x + enemy.rect.w / 2;
      ctrl.dir = weightedDir({
        down: 5,
        left: cx > b.x + b.w ? 3 : 0.5,
        right: cx < b.x ? 3 : 0.5,
        up: 0.5,
      });
    } else {
      ctrl.dir = weightedDir({ down: 4, left: 2, right: 2, up: 1 });
    }
    ctrl.wantsRandomFire = rng() < fireChance;
  }

  function decideFast(enemy, ctrl, _world) {
    // Count enemies per flank; run to the emptier one, then descend.
    const mid = FIELD_PX / 2;
    let leftCount = 0;
    let rightCount = 0;
    for (const [other] of aliveUnits()) {
      if (other === enemy) continue;
      if (other.rect.x + other.rect.w / 2 < mid) leftCount++;
      else rightCount++;
    }
    const cx = enemy.rect.x + enemy.rect.w / 2;
    const targetLeft = leftCount <= rightCount;
    const onTargetFlank = targetLeft ? cx < mid : cx >= mid;
    if (!onTargetFlank && enemy.rect.y < FIELD_PX / 2 && rng() < 0.7) {
      ctrl.dir = targetLeft ? 'left' : 'right';
    } else {
      ctrl.dir = weightedDir({ down: 6, left: 1, right: 1, up: 0.5 });
    }
    ctrl.wantsRandomFire = false; // opportunistic only
  }

  function decideHeavy(enemy, ctrl, _world, blocked) {
    ctrl.replanTimer -= CONFIG.ai.decisionInterval;
    if (!ctrl.path || blocked || ctrl.replanTimer <= 0) {
      const pos = halfPos(enemy);
      ctrl.path = findPath(grid, pos.hc, pos.hr, baseGoals());
      ctrl.pathStep = 1; // 0 is the start node
      ctrl.replanTimer = CONFIG.ai.heavyReplanInterval;
    }
    if (ctrl.path && ctrl.pathStep < ctrl.path.length) {
      const pos = halfPos(enemy);
      let next = ctrl.path[ctrl.pathStep];
      // Advance waypoints we have already reached.
      while (next && next.hc === pos.hc && next.hr === pos.hr) {
        ctrl.pathStep++;
        next = ctrl.path[ctrl.pathStep];
      }
      ctrl.dir = next ? (dirToward(pos, next) ?? 'down') : 'down';
    } else {
      ctrl.dir = weightedDir({ down: 4, left: 1, right: 1, up: 0.5 });
    }
    ctrl.wantsRandomFire = rng() < RANDOM_FIRE_CHANCE.heavy;
  }

  function decide(enemy, ctrl, world, blocked) {
    switch (enemy.type) {
      case 'basic':
        decideBasicLike(enemy, ctrl, world, RANDOM_FIRE_CHANCE.basic);
        break;
      case 'power':
        decideBasicLike(enemy, ctrl, world, RANDOM_FIRE_CHANCE.power);
        break;
      case 'fast':
        decideFast(enemy, ctrl, world);
        break;
      case 'heavy':
        decideHeavy(enemy, ctrl, null, blocked);
        break;
    }
    ctrl.decisionTimer = CONFIG.ai.decisionInterval;
  }

  /** Is the heavy's next path step into standing brick it faces? */
  function facingPathBrick(enemy, ctrl) {
    if (enemy.type !== 'heavy' || !ctrl.path) return false;
    const next = ctrl.path[ctrl.pathStep];
    if (!next) return false;
    const pos = halfPos(enemy);
    if (dirToward(pos, next) !== enemy.tank.facing) return false;
    return nodeCost(grid, next.hc, next.hr) >= BRICK_COST;
  }

  function maybeFire(enemy, ctrl, world) {
    const los = lineOfFire(grid, enemy, world);
    const shouldFire =
      los !== null || // always shoot players/base in the lane
      ctrl.wantsRandomFire ||
      facingPathBrick(enemy, ctrl);
    if (!shouldFire) return;
    const request = enemy.tryFire();
    if (request) {
      ctrl.wantsRandomFire = false;
      world.fire(request);
    }
  }

  return {
    register(enemy) {
      units.set(enemy, makeCtrl());
    },
    unregister(enemy) {
      units.delete(enemy);
    },
    roleOf(enemy) {
      return units.get(enemy)?.role ?? null;
    },
    /** Test/debug: all current roles. */
    roles() {
      return aliveUnits().map(([e, c]) => ({ enemy: e, role: c.role }));
    },

    update(dt, world) {
      for (const [enemy] of units) {
        if (enemy.dead) units.delete(enemy);
      }
      assignRoles();

      for (const [enemy, ctrl] of units) {
        // Freeze gates the decision tick; telegraphing tanks idle too.
        if (enemy.tank.state !== 'alive' || enemy.frozenByStopwatch) continue;

        ctrl.decisionTimer -= dt;

        const blockerRects = world.blockersFor(enemy);
        const isBlocked = (rect) => {
          if (grid.isSolidForTank(rect)) return true;
          return blockerRects.some(
            (b) =>
              rect.x < b.x + b.w && rect.x + rect.w > b.x && rect.y < b.y + b.h && rect.y + rect.h > b.y
          );
        };

        const moved = enemy.drive(ctrl.dir, dt, isBlocked, {
          onIce: grid.isIce(enemy.rect),
        });
        const blocked = ctrl.dir !== null && moved === 0;

        if (ctrl.decisionTimer <= 0 || blocked) {
          decide(enemy, ctrl, world, blocked);
        }

        maybeFire(enemy, ctrl, world);
      }
    },
  };
}
