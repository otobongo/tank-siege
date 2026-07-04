import { describe, it, expect } from 'vitest';
import stages from '../src/stages/index.js';
import { validateStage } from '../src/stages/format.js';

/** Same weighted threat the authoring pass used. */
function threat(stage) {
  const count = (t) => stage.enemies.filter((c) => c === t).length;
  return (
    count('b') + 2 * count('f') + 3 * count('m') + 4 * count('h') +
    (3.0 - stage.spawnInterval) * 20
  );
}

describe('all 35 stages', () => {
  it('exports 35 stages with ids 1..35 in order', () => {
    expect(stages).toHaveLength(35);
    stages.forEach((s, i) => expect(s.id).toBe(i + 1));
  });

  it('every stage passes validator rules 1-6 (including reachability)', () => {
    for (const stage of stages) {
      expect(validateStage(stage), `stage ${stage.id}`).toEqual([]);
    }
  });

  it('roster totals are 20 everywhere', () => {
    for (const stage of stages) {
      expect(stage.enemies, `stage ${stage.id}`).toHaveLength(20);
    }
  });

  it('anchor rosters match the plan exactly', () => {
    const roster = (s) => ({
      b: s.enemies.filter((c) => c === 'b').length,
      f: s.enemies.filter((c) => c === 'f').length,
      m: s.enemies.filter((c) => c === 'm').length,
      h: s.enemies.filter((c) => c === 'h').length,
    });
    expect(roster(stages[0])).toEqual({ b: 18, f: 2, m: 0, h: 0 });
    expect(roster(stages[1])).toEqual({ b: 14, f: 4, m: 0, h: 2 });
    expect(roster(stages[2])).toEqual({ b: 14, f: 4, m: 0, h: 2 });
    expect(roster(stages[33])).toEqual({ b: 0, f: 10, m: 4, h: 6 });
    expect(roster(stages[34])).toEqual({ b: 0, f: 6, m: 4, h: 10 });
  });

  it('difficulty is monotonic-ish: threat(N) >= threat(N-2)', () => {
    for (let i = 2; i < stages.length; i++) {
      expect(threat(stages[i]), `stage ${i + 1} vs ${i - 1}`).toBeGreaterThanOrEqual(
        threat(stages[i - 2])
      );
    }
  });

  it('spawn interval interpolates 3.0 -> 0.8, never increasing', () => {
    expect(stages[0].spawnInterval).toBe(3.0);
    expect(stages[34].spawnInterval).toBe(0.8);
    for (let i = 1; i < stages.length; i++) {
      expect(stages[i].spawnInterval).toBeLessThanOrEqual(stages[i - 1].spawnInterval);
      expect(stages[i].spawnInterval).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('band rules: stages 1-5 use no water or ice; ice waits for stage 13', () => {
    for (const stage of stages.slice(0, 5)) {
      const flat = stage.layout.join('');
      expect(flat.includes('W'), `stage ${stage.id}`).toBe(false);
      expect(flat.includes('I'), `stage ${stage.id}`).toBe(false);
    }
    for (const stage of stages.slice(5, 12)) {
      expect(stage.layout.join('').includes('I'), `stage ${stage.id}`).toBe(false);
    }
  });

  it('heavies are never the first spawn', () => {
    for (const stage of stages) {
      expect(stage.enemies[0], `stage ${stage.id}`).not.toBe('h');
    }
  });

  it('stage objects are frozen', () => {
    for (const stage of stages) {
      expect(Object.isFrozen(stage)).toBe(true);
    }
  });

  it('validator rejects broken stages', () => {
    expect(validateStage({})).not.toEqual([]);
    expect(
      validateStage({
        id: 99,
        layout: Array.from({ length: 13 }, () => 'SSSSSSSSSSSSS'),
        enemies: 'b'.repeat(20).split(''),
        spawnInterval: 1,
      })
    ).not.toEqual([]); // spawn cells blocked and unreachable
    const good = stages[0];
    expect(validateStage({ ...good, spawnInterval: 0.5 })).not.toEqual([]);
    expect(validateStage({ ...good, enemies: 'b'.repeat(19).split('') })).not.toEqual([]);
  });
});
