/**
 * Explosions, debris, muzzle flash, screen shake, hit-stop, rumble.
 *
 * Pure juice: subscribes to the event bus and never touches game
 * logic. The loop consumes two outputs each frame:
 *   getShakeOffset() -> {x, y} to translate the world layer by
 *   consumeHitStopFrames() -> whole update steps to skip (2-frame
 *     freeze on a heavy's final hit and on player death)
 *
 * Reduced motion: shake and hit-stop are disabled when the OS asks
 * for reduced motion (prefers-reduced-motion), respected by default.
 * Gamepad rumble goes through vibrationActuator where available
 * (Chromium only) and is fully guarded.
 *
 * Public interface (owned by TS-020):
 *   createParticles({ bus, reducedMotion?, getPads? }) -> {
 *     update(dt), render(ctx), spawnMuzzleFlash(x, y, dir),
 *     getShakeOffset(), consumeHitStopFrames(), count, dispose()
 *   }
 */

import { CONFIG } from '../core/config.js';
import { DIR_VECTORS } from '../engine/collision.js';

const P = CONFIG.palette;

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function createParticles({ bus, reducedMotion = prefersReducedMotion(), getPads } = {}) {
  const particles = []; // { x, y, vx, vy, life, maxLife, size, color }
  const rings = []; // { x, y, life, maxLife, maxRadius, color }
  let shake = 0; // magnitude px, decays
  let shakeSeed = 0;
  let hitStopFrames = 0;

  function burst(x, y, { count, speed, life, size, colors }) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const v = speed * (0.4 + Math.random() * 0.6);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life,
        maxLife: life,
        size,
        color: colors[i % colors.length],
      });
    }
  }

  function ring(x, y, maxRadius, life, color) {
    rings.push({ x, y, life, maxLife: life, maxRadius, color });
  }

  function addShake(magnitude) {
    if (reducedMotion) return;
    shake = Math.max(shake, magnitude);
  }

  function addHitStop() {
    if (reducedMotion) return;
    hitStopFrames = Math.max(hitStopFrames, CONFIG.juice.hitStopFrames);
  }

  function rumble(pattern) {
    if (!getPads) return;
    try {
      for (const pad of getPads() ?? []) {
        pad?.vibrationActuator?.playEffect?.('dual-rumble', {
          duration: pattern.duration,
          weakMagnitude: pattern.weak,
          strongMagnitude: pattern.strong,
        });
      }
    } catch {
      // Unsupported pad or browser: silence, never errors.
    }
  }

  // --- Event wiring ---------------------------------------------------

  const subs = [
    bus.on('brickHit', ({ x, y, dir }) => {
      // Debris chips fly perpendicular to the destroying bullet.
      const { dx, dy } = DIR_VECTORS[dir];
      for (let i = 0; i < 6; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const spread = 30 + Math.random() * 50;
        particles.push({
          x,
          y,
          vx: dy * side * spread - dx * 20 * Math.random(),
          vy: dx * side * spread - dy * 20 * Math.random(),
          life: 0.35,
          maxLife: 0.35,
          size: 2,
          color: i % 2 ? P.brickRust : P.brickMortar,
        });
      }
    }),
    bus.on('steelClang', ({ x, y }) => {
      burst(x, y, { count: 4, speed: 90, life: 0.2, size: 1, colors: [P.steelHighlight, P.white] });
    }),
    bus.on('bulletCancel', ({ x, y }) => {
      burst(x, y, { count: 4, speed: 60, life: 0.15, size: 1, colors: [P.uiGray] });
    }),
    bus.on('tankDestroyed', ({ x, y, type }) => {
      burst(x, y, { count: 12, speed: 120, life: 0.45, size: 3, colors: [P.alertRed, P.playerYellow, P.uiGray] });
      ring(x, y, 22, 0.35, P.playerYellow);
      addShake(CONFIG.juice.shake.tankExplosion);
      if (type === 'heavy') addHitStop(); // the big one earns a freeze
      rumble(CONFIG.juice.rumble.bulletConnect);
    }),
    bus.on('playerDeath', () => {
      addShake(CONFIG.juice.shake.tankExplosion);
      addHitStop();
      rumble(CONFIG.juice.rumble.playerDeath);
    }),
    bus.on('baseDestroyed', ({ x, y }) => {
      burst(x, y, { count: 24, speed: 160, life: 0.9, size: 4, colors: [P.alertRed, P.playerYellow, P.white] });
      ring(x, y, 48, 0.7, P.alertRed);
      ring(x, y, 32, 0.5, P.playerYellow);
      addShake(CONFIG.juice.shake.baseHit);
      rumble(CONFIG.juice.rumble.baseHit);
    }),
  ];

  return {
    get count() {
      return particles.length + rings.length;
    },

    /** Muzzle flash at a fire origin (called by the orchestrator). */
    spawnMuzzleFlash(x, y, dir) {
      const { dx, dy } = DIR_VECTORS[dir];
      burst(x + dx * 4, y + dy * 4, {
        count: 3,
        speed: 40,
        life: 0.08,
        size: 2,
        colors: [P.white, P.playerYellow],
      });
    },

    update(dt) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        rings[i].life -= dt;
        if (rings[i].life <= 0) rings.splice(i, 1);
      }
      if (shake > 0) {
        shake = Math.max(0, shake - 18 * dt);
        shakeSeed++;
      }
    },

    render(ctx) {
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), p.size, p.size);
      }
      ctx.globalAlpha = 1;
      for (const r of rings) {
        const t = 1 - r.life / r.maxLife;
        ctx.strokeStyle = r.color;
        ctx.globalAlpha = 1 - t;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(Math.round(r.x), Math.round(r.y), Math.max(1, r.maxRadius * t), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },

    getShakeOffset() {
      if (shake <= 0) return { x: 0, y: 0 };
      // Deterministic-ish jitter without Math.random per frame.
      const angle = shakeSeed * 2.399963; // golden angle scramble
      return {
        x: Math.round(Math.cos(angle) * shake),
        y: Math.round(Math.sin(angle) * shake),
      };
    },

    /** Steps the loop should skip this frame (then reset). */
    consumeHitStopFrames() {
      const frames = hitStopFrames;
      hitStopFrames = 0;
      return frames;
    },

    dispose() {
      for (const off of subs) off();
      particles.length = 0;
      rings.length = 0;
    },
  };
}
