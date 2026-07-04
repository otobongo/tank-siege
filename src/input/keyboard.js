/**
 * Keyboard input backend: event-driven pressed-map.
 *
 * Public interface (owned by TS-006):
 *   createKeyboard({ target }) -> {
 *     attach(), detach(),
 *     applyTo(actionState, mapName),  // mapName: 'p1' | 'p2'
 *     isPressed(code)
 *   }
 *
 * preventDefault fires on game keys only, so browser shortcuts and
 * devtools stay usable.
 */

import { CONFIG } from '../core/config.js';
import { ACTIONS } from './actions.js';

export function createKeyboard({ target } = {}) {
  const pressed = new Set();
  const maps = CONFIG.input.keyboard;
  const gameKeys = new Set([
    ...Object.values(maps.p1),
    ...Object.values(maps.p2),
    maps.mute,
  ]);

  function onKeyDown(e) {
    if (gameKeys.has(e.code)) {
      pressed.add(e.code);
      e.preventDefault();
    }
  }

  function onKeyUp(e) {
    if (gameKeys.has(e.code)) {
      pressed.delete(e.code);
      e.preventDefault();
    }
  }

  function onBlur() {
    pressed.clear(); // avoid stuck keys when focus leaves the tab
  }

  return {
    attach(t = target ?? window) {
      t.addEventListener('keydown', onKeyDown);
      t.addEventListener('keyup', onKeyUp);
      t.addEventListener('blur', onBlur);
    },
    detach(t = target ?? window) {
      t.removeEventListener('keydown', onKeyDown);
      t.removeEventListener('keyup', onKeyUp);
      t.removeEventListener('blur', onBlur);
    },
    /** Test hooks and hub plumbing. */
    isPressed(code) {
      return pressed.has(code);
    },
    handleEvent(type, code) {
      if (type === 'keydown') pressed.add(code);
      else if (type === 'keyup') pressed.delete(code);
    },
    /** Push this map's held keys into an ActionState. */
    applyTo(actionState, mapName) {
      const map = maps[mapName];
      for (const action of ACTIONS) {
        if (map[action] && pressed.has(map[action])) {
          actionState.set(action, true);
        }
      }
    },
  };
}
