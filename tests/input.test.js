import { describe, it, expect, vi } from 'vitest';
import { createActionState, createInputHub } from '../src/input/actions.js';
import { createKeyboard } from '../src/input/keyboard.js';
import { quantizeStick, createGamepads } from '../src/input/gamepad.js';

describe('action state', () => {
  it('press/hold/release with justPressed edges', () => {
    const s = createActionState();

    s.set('fire', true);
    s.commit();
    expect(s.isDown('fire')).toBe(true);
    expect(s.justPressed('fire')).toBe(true);

    s.commit(); // still held (live unchanged)
    expect(s.isDown('fire')).toBe(true);
    expect(s.justPressed('fire')).toBe(false);

    s.clearLive();
    s.commit();
    expect(s.isDown('fire')).toBe(false);

    s.set('fire', true);
    s.commit();
    expect(s.justPressed('fire')).toBe(true); // re-press edges again
  });

  it('latest-pressed direction wins, reverts on release', () => {
    const s = createActionState();
    s.set('up', true);
    s.commit();
    expect(s.direction).toBe('up');

    s.set('right', true); // up still held
    s.commit();
    expect(s.direction).toBe('right');

    s.clearLive();
    s.set('up', true); // right released
    s.commit();
    expect(s.direction).toBe('up');
  });
});

describe('keyboard backend', () => {
  it('maps held keys through applyTo with mocked events', () => {
    const kb = createKeyboard();
    const s = createActionState();

    kb.handleEvent('keydown', 'ArrowUp');
    kb.handleEvent('keydown', 'Space');
    kb.applyTo(s, 'p1');
    s.commit();
    expect(s.isDown('up')).toBe(true);
    expect(s.isDown('fire')).toBe(true);
    expect(s.justPressed('fire')).toBe(true);

    kb.handleEvent('keyup', 'Space');
    s.clearLive();
    kb.applyTo(s, 'p1');
    s.commit();
    expect(s.isDown('up')).toBe(true);
    expect(s.isDown('fire')).toBe(false);
  });

  it('p2 map is independent', () => {
    const kb = createKeyboard();
    const p1 = createActionState();
    const p2 = createActionState();
    kb.handleEvent('keydown', 'KeyW');
    kb.applyTo(p1, 'p1');
    kb.applyTo(p2, 'p2');
    p1.commit();
    p2.commit();
    expect(p1.isDown('up')).toBe(false);
    expect(p2.isDown('up')).toBe(true);
  });
});

describe('stick quantization', () => {
  it('(0.9, 0.2) -> right; (0.2, 0.2) inside deadzone -> none', () => {
    expect(quantizeStick(0.9, 0.2, 0.3)).toBe('right');
    expect(quantizeStick(0.2, 0.2, 0.3)).toBe(null);
  });

  it('larger axis wins; y sign maps to up/down', () => {
    expect(quantizeStick(0.3, -0.8, 0.3)).toBe('up');
    expect(quantizeStick(0.3, 0.8, 0.3)).toBe('down');
    expect(quantizeStick(-0.8, 0.3, 0.3)).toBe('left');
  });
});

describe('input hub', () => {
  function mockPad(index, actions = {}) {
    return {
      index,
      connected: true,
      buttons: Array.from({ length: 16 }, (_, i) => ({
        pressed:
          (i === 12 && actions.up) ||
          (i === 13 && actions.down) ||
          (i === 14 && actions.left) ||
          (i === 15 && actions.right) ||
          (i === 0 && actions.fire) ||
          (i === 9 && actions.start) ||
          false,
      })),
      axes: [0, 0],
    };
  }

  it('first pad takes P1, keyboard falls back to P2', () => {
    let pads = [];
    const gamepads = createGamepads({ getGamepads: () => pads });
    const kb = createKeyboard();
    const hub = createInputHub({ keyboard: kb, gamepads, playerCount: 2 });

    // No pads: keyboard p1 map drives slot 0.
    kb.handleEvent('keydown', 'ArrowLeft');
    hub.update();
    expect(hub.players[0].isDown('left')).toBe(true);

    // Pad appears (auto-assign on poll, the browser privacy-gate path)
    // and fires; keyboard p1 map should now drive... still slot 1?
    pads = [mockPad(0, { fire: true })];
    hub.update();
    const a = hub.assignments();
    expect(a[0].pad).toBe(0);
    expect(a[0].keyboardFallback).toBe(false);
    expect(hub.players[0].isDown('fire')).toBe(true);
    // Keyboard p1 map now drives the padless slot (P2).
    expect(hub.players[1].isDown('left')).toBe(true);
  });

  it('disconnect reverts to keyboard fallback without crash', () => {
    let pads = [mockPad(0, { up: true })];
    const gamepads = createGamepads({ getGamepads: () => pads });
    const kb = createKeyboard();
    const hub = createInputHub({ keyboard: kb, gamepads, playerCount: 2 });
    const onChange = vi.fn();
    hub.onAssignmentChange(onChange);

    hub.update();
    expect(hub.assignments()[0].pad).toBe(0);

    // Simulate gamepaddisconnected event.
    pads = [];
    gamepads.attach({ addEventListener: (name, fn) => (name === 'gamepaddisconnected' ? (gamepads._dc = fn) : null), });
    gamepads._dc({ gamepad: { index: 0 } });
    hub.update();
    expect(hub.assignments()[0].pad).toBe(null);
    expect(hub.assignments()[0].keyboardFallback).toBe(true);
    expect(onChange).toHaveBeenCalled();

    kb.handleEvent('keydown', 'ArrowUp');
    hub.update();
    expect(hub.players[0].isDown('up')).toBe(true);
  });

  it('two pads take both slots; keyboard merges into home slots', () => {
    const pads = [mockPad(0, { fire: true }), mockPad(1, { up: true })];
    const gamepads = createGamepads({ getGamepads: () => pads });
    const kb = createKeyboard();
    const hub = createInputHub({ keyboard: kb, gamepads, playerCount: 2 });

    kb.handleEvent('keydown', 'ArrowDown'); // p1 map
    hub.update();
    expect(hub.players[0].isDown('fire')).toBe(true);
    expect(hub.players[0].isDown('down')).toBe(true); // keyboard merged
    expect(hub.players[1].isDown('up')).toBe(true);
  });
});
