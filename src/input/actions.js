/**
 * Virtual action definitions and per-player action state.
 *
 * Game code reads ONLY action state; it never touches hardware APIs.
 * Backends (keyboard.js, gamepad.js) feed raw pressed values into each
 * player's ActionState via set(); the hub commits once per simulation
 * tick, which is what makes justPressed edges deterministic.
 *
 * Public interface (owned by TS-006):
 *   ACTIONS, DIRECTIONS
 *   createActionState() -> {
 *     set(action, pressed), commit(),
 *     isDown(action), justPressed(action), direction
 *   }
 *   createInputHub({ keyboard, gamepads, playerCount }) -> {
 *     players: ActionState[], update(), assignments, onAssignmentChange(cb)
 *   }
 */

export const DIRECTIONS = Object.freeze(['up', 'down', 'left', 'right']);
export const ACTIONS = Object.freeze([...DIRECTIONS, 'fire', 'pause', 'start']);

export function createActionState() {
  const live = {}; // raw values written by backends between ticks
  const current = {}; // committed this tick
  const previous = {}; // committed last tick
  const pressSeq = {}; // press ordering for latest-direction-wins
  let seqCounter = 0;
  for (const a of ACTIONS) {
    live[a] = false;
    current[a] = false;
    previous[a] = false;
    pressSeq[a] = 0;
  }

  return {
    /** Backend write. OR-merge: a second backend can hold an action down. */
    set(action, pressed) {
      if (!(action in live)) return;
      if (pressed && !live[action]) pressSeq[action] = ++seqCounter;
      live[action] = pressed;
    },
    /** Clear all live values (hub does this before each poll pass). */
    clearLive() {
      for (const a of ACTIONS) live[a] = false;
    },
    /** Latch live values for this tick and shift edge history. */
    commit() {
      for (const a of ACTIONS) {
        previous[a] = current[a];
        current[a] = live[a];
      }
    },
    isDown(action) {
      return current[action] === true;
    },
    justPressed(action) {
      return current[action] === true && previous[action] === false;
    },
    /**
     * The direction the tank should take: among held directions, the
     * latest-pressed wins (original behavior, not vector sum).
     */
    get direction() {
      let best = null;
      let bestSeq = -1;
      for (const d of DIRECTIONS) {
        if (current[d] && pressSeq[d] > bestSeq) {
          best = d;
          bestSeq = pressSeq[d];
        }
      }
      return best;
    },
  };
}

/**
 * Input hub: owns both players' action states, device assignment, and
 * the per-tick poll/commit cycle.
 *
 * Assignment rules (plan TS-006):
 *   - First pad connected -> first player slot without a pad; second
 *     pad -> the other slot. Hot-plug reassigns cleanly.
 *   - Keyboard is always available as a fallback: its P1 map drives the
 *     first padless slot, its P2 map the second padless slot. When all
 *     slots have pads, keyboard maps merge into their home slots so a
 *     player can use either.
 *
 * @param {{ keyboard: object, gamepads: object, playerCount?: number }} deps
 *   injected backends (see keyboard.js / gamepad.js for their shapes)
 */
export function createInputHub({ keyboard, gamepads, playerCount = 2 }) {
  const players = Array.from({ length: playerCount }, () => createActionState());
  const padForSlot = new Array(playerCount).fill(null); // gamepad index or null
  const listeners = new Set();

  function notify() {
    const snapshot = assignments();
    for (const cb of listeners) cb(snapshot);
  }

  function assignments() {
    return players.map((_, i) => ({
      player: i + 1,
      pad: padForSlot[i],
      keyboardFallback: padForSlot[i] === null,
    }));
  }

  function assignPad(padIndex) {
    if (padForSlot.includes(padIndex)) return;
    const slot = padForSlot.indexOf(null);
    if (slot === -1) return;
    padForSlot[slot] = padIndex;
    notify();
  }

  function unassignPad(padIndex) {
    const slot = padForSlot.indexOf(padIndex);
    if (slot !== -1) {
      padForSlot[slot] = null;
      notify();
    }
  }

  gamepads?.onConnectionChange?.((event) => {
    if (event.connected) assignPad(event.index);
    else unassignPad(event.index);
  });

  return {
    players,
    assignments,
    onAssignmentChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    /** Run once at the top of every simulation tick. */
    update() {
      for (const p of players) p.clearLive();

      // Gamepads first: assignment must settle before the keyboard
      // picks its fallback slots for this tick.
      let snapshots = [];
      if (gamepads) {
        snapshots = gamepads.poll();
        for (const snap of snapshots) {
          if (snap && !padForSlot.includes(snap.index)) assignPad(snap.index);
        }
      }

      // Keyboard: maps drive the padless slots first.
      if (keyboard) {
        const padless = [];
        for (let i = 0; i < playerCount; i++) {
          if (padForSlot[i] === null) padless.push(i);
        }
        const kbTargets = [
          padless[0] ?? 0, // p1 map
          padless[1] ?? Math.min(1, playerCount - 1), // p2 map
        ];
        keyboard.applyTo(players[kbTargets[0]], 'p1');
        if (playerCount > 1 && kbTargets[1] !== kbTargets[0]) {
          keyboard.applyTo(players[kbTargets[1]], 'p2');
        }
      }

      // Merge pad actions into their assigned slots.
      for (let i = 0; i < playerCount; i++) {
        if (padForSlot[i] === null) continue;
        const snap = snapshots.find((s) => s && s.index === padForSlot[i]);
        if (!snap) continue;
        for (const a of ACTIONS) {
          if (snap.actions[a]) players[i].set(a, true);
        }
      }

      for (const p of players) p.commit();
    },
  };
}
