/**
 * Title screen: logo, 1P/2P/stage-select menu, controller toasts,
 * "press any button" gamepad hint.
 *
 * Stage select is unlocked up to the highest stage reached this
 * browser session (passed in via getMaxStage). Hold left/right to
 * scroll the stage number (repeat while held).
 *
 * Public interface (owned by TS-019):
 *   createTitleScreen({ ctx, actions, getMaxStage, onStart,
 *                       getToast }) -> state handler
 *   onStart({ players: 1|2, stage: number })
 */

import { CONFIG } from '../core/config.js';

const P = CONFIG.palette;
const W = CONFIG.canvas.width;
const H = CONFIG.canvas.height;

export function createTitleScreen({ ctx, actions, getMaxStage, onStart, getToast }) {
  const items = ['1 PLAYER', '2 PLAYERS', 'STAGE SELECT'];
  let index = 0;
  let stagePick = 1;
  let time = 0;
  let holdTimer = 0;

  function confirm() {
    if (index === 0) onStart({ players: 1, stage: stagePick });
    else if (index === 1) onStart({ players: 2, stage: stagePick });
    // index 2 (stage select) adjusts with left/right; fire also starts.
    else onStart({ players: 1, stage: stagePick });
  }

  return {
    enter() {
      time = 0;
      stagePick = Math.min(stagePick, getMaxStage());
    },
    update(dt) {
      time += dt;
      if (actions.justPressed('down')) index = (index + 1) % items.length;
      if (actions.justPressed('up')) index = (index + items.length - 1) % items.length;

      if (index === 2) {
        const step = (delta) => {
          stagePick = Math.min(Math.max(1, stagePick + delta), getMaxStage());
        };
        if (actions.justPressed('right')) step(1);
        if (actions.justPressed('left')) step(-1);
        // Hold to scroll.
        if (actions.isDown('right') || actions.isDown('left')) {
          holdTimer += dt;
          if (holdTimer > 0.4) {
            step(actions.isDown('right') ? 1 : -1);
            holdTimer = 0.32;
          }
        } else {
          holdTimer = 0;
        }
      }

      if (actions.justPressed('fire') || actions.justPressed('start')) confirm();
    },
    render() {
      ctx.fillStyle = P.black;
      ctx.fillRect(0, 0, W, H);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = P.brickRust;
      ctx.font = 'bold 48px monospace';
      ctx.fillText('TANK SIEGE', W / 2, 110);
      ctx.fillStyle = P.playerYellow;
      ctx.font = 'bold 46px monospace';
      ctx.fillText('TANK SIEGE', W / 2 - 2, 108);

      ctx.font = '16px monospace';
      items.forEach((label, i) => {
        const y = 210 + i * 32;
        ctx.fillStyle = i === index ? P.playerYellow : P.uiGray;
        let text = label;
        if (i === 2) text = `${label}  <${String(stagePick).padStart(2, '0')}>`;
        ctx.fillText(text, W / 2, y);
        if (i === index && Math.floor(time * 3) % 2 === 0) {
          ctx.fillText('>', W / 2 - ctx.measureText(text).width / 2 - 18, y);
        }
      });

      ctx.fillStyle = P.uiGray;
      ctx.font = '11px monospace';
      ctx.fillText('ARROWS/WASD MOVE  SPACE/F FIRE  M MUTE  C CRT', W / 2, H - 60);
      ctx.fillText('GAMEPAD: PRESS ANY BUTTON TO JOIN', W / 2, H - 42);

      const toast = getToast?.();
      if (toast) {
        ctx.fillStyle = P.treeHighlight;
        ctx.fillText(toast, W / 2, H - 20);
      }
    },
  };
}
