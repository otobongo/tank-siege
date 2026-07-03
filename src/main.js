/**
 * Tank Siege bootstrap.
 * Owns the canvas element, integer scaling, the fixed-step loop, and
 * the top-level state machine. Screens (TS-019) will replace the debug
 * state handlers registered here.
 */

import { CONFIG } from './core/config.js';
import { createLoop } from './core/loop.js';
import { createStateMachine, createSession, STATES } from './core/state.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

/**
 * Scale the canvas to the largest integer multiple of the logical
 * resolution that fits the viewport, keeping pixels crisp.
 */
function fitCanvas() {
  const scaleX = Math.floor(window.innerWidth / CONFIG.canvas.width);
  const scaleY = Math.floor(window.innerHeight / CONFIG.canvas.height);
  const scale = Math.max(1, Math.min(scaleX, scaleY));
  canvas.style.width = `${CONFIG.canvas.width * scale}px`;
  canvas.style.height = `${CONFIG.canvas.height * scale}px`;
}

window.addEventListener('resize', fitCanvas);
fitCanvas();

const session = createSession(1);

/** Debug state handler: renders the state name until screens exist. */
function debugState(name) {
  let ticks = 0;
  return {
    update() {
      ticks++;
    },
    render() {
      ctx.fillStyle = CONFIG.palette.black;
      ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
      ctx.fillStyle = CONFIG.palette.uiGray;
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(name, CONFIG.canvas.width / 2, CONFIG.canvas.height / 2);
      ctx.fillText(
        `ticks: ${ticks}`,
        CONFIG.canvas.width / 2,
        CONFIG.canvas.height / 2 + 24
      );
    },
  };
}

const machine = createStateMachine(
  {
    TITLE: debugState('TITLE'),
    STAGE_INTRO: debugState('STAGE_INTRO'),
    PLAYING: debugState('PLAYING'),
    PAUSED: debugState('PAUSED'),
    TALLY: debugState('TALLY'),
    GAME_OVER: debugState('GAME_OVER'),
  },
  STATES.TITLE
);

const loop = createLoop({
  update: (dt) => machine.update(dt),
  render: () => machine.render(ctx),
});

loop.start();

// Expose for devtools poking during development only.
window.__tankSiege = { machine, session, loop };
