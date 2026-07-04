/**
 * Gamepad input backend: per-frame polling, standard mapping, stick
 * quantization, hot-plug events.
 *
 * Public interface (owned by TS-006):
 *   quantizeStick(x, y, deadzone) -> 'up'|'down'|'left'|'right'|null
 *   createGamepads({ getGamepads, target }) -> {
 *     attach(), detach(), poll() -> snapshots,
 *     onConnectionChange(cb) -> unsubscribe
 *   }
 *
 * A snapshot is { index, actions: { up, down, left, right, fire,
 * pause, start } } with booleans. poll() must run inside the update
 * step (Gamepad objects are live only when re-read each frame).
 */

import { CONFIG } from '../core/config.js';

/**
 * Quantize a stick vector to 4 directions. Inside the radial deadzone
 * returns null; otherwise the larger-magnitude axis wins.
 */
export function quantizeStick(x, y, deadzone = CONFIG.input.gamepad.stickDeadzone) {
  if (Math.hypot(x, y) < deadzone) return null;
  if (Math.abs(x) >= Math.abs(y)) return x > 0 ? 'right' : 'left';
  return y > 0 ? 'down' : 'up';
}

export function createGamepads({ getGamepads, target } = {}) {
  const readPads = getGamepads ?? (() => navigator.getGamepads?.() ?? []);
  const listeners = new Set();
  const cfg = CONFIG.input.gamepad;

  function onConnected(e) {
    for (const cb of listeners) cb({ index: e.gamepad.index, connected: true });
  }

  function onDisconnected(e) {
    for (const cb of listeners) cb({ index: e.gamepad.index, connected: false });
  }

  return {
    attach(t = target ?? window) {
      t.addEventListener('gamepadconnected', onConnected);
      t.addEventListener('gamepaddisconnected', onDisconnected);
    },
    detach(t = target ?? window) {
      t.removeEventListener('gamepadconnected', onConnected);
      t.removeEventListener('gamepaddisconnected', onDisconnected);
    },
    onConnectionChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    /** Read all connected pads into plain snapshots. */
    poll() {
      const snapshots = [];
      for (const pad of readPads()) {
        if (!pad || !pad.connected) continue;
        const b = (i) => pad.buttons[i]?.pressed === true;
        const stickDir = quantizeStick(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
        snapshots.push({
          index: pad.index,
          actions: {
            up: b(cfg.dpad.up) || stickDir === 'up',
            down: b(cfg.dpad.down) || stickDir === 'down',
            left: b(cfg.dpad.left) || stickDir === 'left',
            right: b(cfg.dpad.right) || stickDir === 'right',
            fire: b(cfg.fire),
            pause: b(cfg.start), // Start doubles as pause in play
            start: b(cfg.start),
          },
        });
      }
      return snapshots;
    },
  };
}
