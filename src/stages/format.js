/**
 * Stage schema validator (TS-021, format frozen at TS-004).
 *
 * A stage is a frozen object: { id, layout, enemies, spawnInterval }.
 * layout: 13 strings x 13 chars using STAGE_ALPHABET.
 * enemies: exactly 20 entries from ENEMY_ALPHABET (order = spawn order).
 * spawnInterval: seconds between spawn attempts, within [0.8, 3.0].
 *
 * validateStage(stage) returns an array of human-readable error strings;
 * an empty array means the stage is valid.
 */

/** Terrain characters allowed in stage layouts. */
export const STAGE_ALPHABET = ['.', 'B', 'S', 'W', 'I', 'T'];

/** Enemy type characters allowed in rosters. */
export const ENEMY_ALPHABET = ['b', 'f', 'm', 'h'];

const ROWS = 13;
const COLS = 13;
const ROSTER_SIZE = 20;
const SPAWN_INTERVAL_MIN = 0.8;
const SPAWN_INTERVAL_MAX = 3.0;

/** Enemy spawn point block coordinates on row 0. */
const SPAWN_COLS = [0, 6, 12];

/**
 * Blocks that must stay '.' on row 12: base (cols 5-7 territory) plus
 * the two player spawn blocks. The engine injects the eagle and the
 * brick shield ring itself (see grid.js).
 */
const BASE_ROW_CLEAR = [4, 5, 6, 7, 8];

/**
 * Base shield ring area targets for the reachability check: any of
 * these blocks being reachable from a spawn point counts as a path
 * to the base.
 */
const BASE_TARGETS = [
  [5, 11],
  [6, 11],
  [7, 11],
  [5, 12],
  [6, 12],
  [7, 12],
];

/**
 * Flood-fill from (startCol, startRow) through passable terrain
 * (anything except steel and water; bricks are destructible so they
 * count as passable). Movement is 4-directional between blocks.
 * Returns true if any base target block is reached.
 * @param {string[]} layout 13 validated rows
 * @param {number} startCol
 * @param {number} startRow
 * @returns {boolean}
 */
function reachesBase(layout, startCol, startRow) {
  const passable = (col, row) => {
    const ch = layout[row][col];
    return ch !== 'S' && ch !== 'W';
  };
  if (!passable(startCol, startRow)) return false;
  const seen = new Set([`${startCol},${startRow}`]);
  const queue = [[startCol, startRow]];
  const isTarget = (col, row) =>
    BASE_TARGETS.some(([tc, tr]) => tc === col && tr === row);
  while (queue.length > 0) {
    const [col, row] = queue.shift();
    if (isTarget(col, row)) return true;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const key = `${nc},${nr}`;
      if (seen.has(key) || !passable(nc, nr)) continue;
      seen.add(key);
      queue.push([nc, nr]);
    }
  }
  return false;
}

/**
 * Validate a stage object against the section 4 schema rules.
 * @param {object} stage candidate stage data
 * @returns {string[]} error strings; empty array = valid
 */
export function validateStage(stage) {
  const errors = [];
  if (!stage || typeof stage !== 'object') {
    return ['stage is not an object'];
  }

  // Rule 1: layout shape and alphabet.
  const { layout } = stage;
  let layoutOk = false;
  if (!Array.isArray(layout) || layout.length !== ROWS) {
    errors.push(`layout must be an array of ${ROWS} rows`);
  } else {
    layoutOk = true;
    layout.forEach((row, r) => {
      if (typeof row !== 'string' || row.length !== COLS) {
        errors.push(`layout row ${r} must be a ${COLS}-char string`);
        layoutOk = false;
        return;
      }
      for (let c = 0; c < COLS; c++) {
        if (!STAGE_ALPHABET.includes(row[c])) {
          errors.push(`layout row ${r} col ${c}: illegal char '${row[c]}'`);
          layoutOk = false;
        }
      }
    });
  }

  if (layoutOk) {
    // Rule 2: enemy spawn points clear on row 0.
    for (const col of SPAWN_COLS) {
      if (layout[0][col] !== '.') {
        errors.push(`row 0 col ${col} must be '.' (enemy spawn point)`);
      }
    }
    // Rule 3: base + player spawn blocks clear on row 12.
    for (const col of BASE_ROW_CLEAR) {
      if (layout[12][col] !== '.') {
        errors.push(`row 12 col ${col} must be '.' (base / player spawns)`);
      }
    }
    // Rule 6: reachability from every spawn point to the base ring.
    for (const col of SPAWN_COLS) {
      if (layout[0][col] === '.' && !reachesBase(layout, col, 0)) {
        errors.push(`spawn point (${col}, 0) cannot reach the base area`);
      }
    }
  }

  // Rule 4: roster size and alphabet.
  const { enemies } = stage;
  if (!Array.isArray(enemies) || enemies.length !== ROSTER_SIZE) {
    errors.push(`enemies must be an array of exactly ${ROSTER_SIZE} entries`);
  } else {
    enemies.forEach((ch, i) => {
      if (!ENEMY_ALPHABET.includes(ch)) {
        errors.push(`enemies[${i}]: illegal type '${ch}'`);
      }
    });
  }

  // Rule 5: spawn interval bounds.
  const { spawnInterval } = stage;
  if (
    typeof spawnInterval !== 'number' ||
    !Number.isFinite(spawnInterval) ||
    spawnInterval < SPAWN_INTERVAL_MIN ||
    spawnInterval > SPAWN_INTERVAL_MAX
  ) {
    errors.push(
      `spawnInterval must be a number in [${SPAWN_INTERVAL_MIN}, ${SPAWN_INTERVAL_MAX}]`
    );
  }

  return errors;
}
