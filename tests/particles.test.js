import { describe, it, expect } from 'vitest';
import { createParticles } from '../src/render/particles.js';
import { createEventBus } from '../src/engine/bullets.js';
import { CONFIG } from '../src/core/config.js';

const DT = 1 / 60;

describe('particles and juice', () => {
  it('brick debris spawns and decays', () => {
    const bus = createEventBus();
    const parts = createParticles({ bus, reducedMotion: false });
    bus.emit('brickHit', { x: 100, y: 100, dir: 'right' });
    expect(parts.count).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) parts.update(DT);
    expect(parts.count).toBe(0);
  });

  it('heavy kill arms hit-stop and shake; consume resets', () => {
    const bus = createEventBus();
    const parts = createParticles({ bus, reducedMotion: false });
    bus.emit('tankDestroyed', { x: 50, y: 50, type: 'heavy' });
    expect(parts.consumeHitStopFrames()).toBe(CONFIG.juice.hitStopFrames);
    expect(parts.consumeHitStopFrames()).toBe(0);
    const off = parts.getShakeOffset();
    expect(Math.abs(off.x) + Math.abs(off.y)).toBeGreaterThan(0);
  });

  it('reduced motion disables shake and hit-stop but not particles', () => {
    const bus = createEventBus();
    const parts = createParticles({ bus, reducedMotion: true });
    bus.emit('tankDestroyed', { x: 50, y: 50, type: 'heavy' });
    bus.emit('playerDeath', {});
    expect(parts.consumeHitStopFrames()).toBe(0);
    expect(parts.getShakeOffset()).toEqual({ x: 0, y: 0 });
    expect(parts.count).toBeGreaterThan(0);
  });

  it('rumble guards against missing/broken actuators', () => {
    const bus = createEventBus();
    const parts = createParticles({
      bus,
      reducedMotion: false,
      getPads: () => [
        null,
        {},
        { vibrationActuator: {} },
        { vibrationActuator: { playEffect: () => { throw new Error('nope'); } } },
      ],
    });
    expect(() => bus.emit('baseDestroyed', { x: 200, y: 400 })).not.toThrow();
    parts.dispose();
  });

  it('dispose unsubscribes', () => {
    const bus = createEventBus();
    const parts = createParticles({ bus, reducedMotion: false });
    parts.dispose();
    bus.emit('brickHit', { x: 0, y: 0, dir: 'up' });
    expect(parts.count).toBe(0);
  });
});
