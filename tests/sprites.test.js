import { describe, it, expect } from 'vitest';
import { atlasLayout, atlasSize, createSpriteAtlas, SPRITE_KEYS } from '../src/render/sprites.js';
import { CONFIG } from '../src/core/config.js';

/** Minimal 2D-context mock for headless atlas building. */
function mockCanvas(w, h) {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const ctx = new Proxy(
    {
      fillRect: noop, clearRect: noop, drawImage: noop,
      save: noop, restore: noop, translate: noop, rotate: noop, scale: noop,
      beginPath: noop, rect: noop, clip: noop, arc: noop, stroke: noop,
      fillText: noop, measureText: () => ({ width: 0 }),
      createRadialGradient: () => gradient,
    },
    {
      get: (t, prop) => (prop in t ? t[prop] : noop),
      set: () => true, // fillStyle etc.
    }
  );
  return { width: w, height: h, getContext: () => ctx };
}

describe('atlas layout', () => {
  it('contains every key the entities can request', () => {
    const layout = atlasLayout();
    const expected = [];
    for (let t = 1; t <= 4; t++)
      for (const d of ['up', 'down', 'left', 'right'])
        for (const f of [0, 1]) expected.push(`player-t${t}-${d}-${f}`);
    for (const e of ['basic', 'fast', 'power', 'heavy'])
      for (const d of ['up', 'down', 'left', 'right'])
        for (const f of [0, 1]) expected.push(`enemy-${e}-${d}-${f}`);
    expected.push(
      'terrain-brick-q', 'terrain-steel', 'terrain-water-0', 'terrain-water-1',
      'terrain-ice', 'terrain-tree', 'eagle-intact', 'eagle-destroyed',
      ...CONFIG.powerups.types.map((p) => `powerup-${p}`),
      'sparkle-0', 'sparkle-1', 'sparkle-2', 'sparkle-3',
      'shield-0', 'shield-1', 'flag', 'hud-life', 'hud-enemy'
    );
    for (const key of expected) {
      expect(layout.has(key), key).toBe(true);
    }
    expect(SPRITE_KEYS).toHaveLength(expected.length);
  });

  it('no two sprites overlap and all fit in the atlas bounds', () => {
    const layout = atlasLayout();
    const { width, height } = atlasSize();
    const entries = [...layout.values()];
    for (const s of entries) {
      expect(s.sx + s.sw).toBeLessThanOrEqual(width);
      expect(s.sy + s.sh).toBeLessThanOrEqual(height);
    }
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];
        const overlap =
          a.sx < b.sx + b.sw && a.sx + a.sw > b.sx && a.sy < b.sy + b.sh && a.sy + a.sh > b.sy;
        expect(overlap).toBe(false);
      }
    }
  });
});

describe('createSpriteAtlas (headless)', () => {
  it('builds and serves every key without throwing', () => {
    const atlas = createSpriteAtlas({ createCanvas: mockCanvas });
    for (const key of SPRITE_KEYS) {
      const s = atlas.get(key);
      expect(s.sw).toBeGreaterThan(0);
      expect(s.sh).toBeGreaterThan(0);
    }
    expect(atlas.keys()).toHaveLength(SPRITE_KEYS.length);
    expect(() => atlas.get('nope')).toThrow();
  });
});
