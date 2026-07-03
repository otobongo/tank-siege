/**
 * Tank Siege bootstrap.
 * Owns the canvas element, integer scaling, and (from TS-003 on) the
 * game loop and state machine wiring.
 */

const LOGICAL_WIDTH = 544;
const LOGICAL_HEIGHT = 416;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

/**
 * Scale the canvas to the largest integer multiple of the logical
 * resolution that fits the viewport, keeping pixels crisp.
 */
function fitCanvas() {
  const scaleX = Math.floor(window.innerWidth / LOGICAL_WIDTH);
  const scaleY = Math.floor(window.innerHeight / LOGICAL_HEIGHT);
  const scale = Math.max(1, Math.min(scaleX, scaleY));
  canvas.style.width = `${LOGICAL_WIDTH * scale}px`;
  canvas.style.height = `${LOGICAL_HEIGHT * scale}px`;
}

window.addEventListener('resize', fitCanvas);
fitCanvas();

// Placeholder frame until TS-003 installs the real loop and state machine.
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
