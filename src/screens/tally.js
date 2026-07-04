/**
 * Score tally: per-type kill counts tick up one by one with SFX
 * (tallyTick events), then totals and the co-op kill-leader bonus
 * reveal. Fire/start advances to the next stage once done.
 *
 * Public interface (owned by TS-019):
 *   createTallyScreen({ ctx, bus, actions, getSession, onAdvance })
 *   The machine passes tally rows via the transition payload.
 */

import { CONFIG } from '../core/config.js';

const P = CONFIG.palette;
const W = CONFIG.canvas.width;
const TYPES = ['basic', 'fast', 'power', 'heavy'];
const TICK_INTERVAL = 0.12;

export function createTallyScreen({ ctx, bus, actions, getSession, onAdvance }) {
  let rows = [];
  let revealed = 0; // how many kill units have been counted so far
  let totalUnits = 0;
  let tickTimer = 0;
  let time = 0;

  return {
    enter(payload) {
      rows = payload?.rows ?? [];
      revealed = 0;
      tickTimer = 0;
      time = 0;
      totalUnits = rows.reduce((sum, r) => sum + r.totalKills, 0);
    },
    update(dt) {
      time += dt;
      if (revealed < totalUnits) {
        tickTimer -= dt;
        if (tickTimer <= 0) {
          revealed++;
          tickTimer = TICK_INTERVAL;
          bus.emit('tallyTick', {});
        }
      } else if (actions.justPressed('fire') || actions.justPressed('start')) {
        onAdvance();
      }
    },
    render() {
      ctx.fillStyle = P.black;
      ctx.fillRect(0, 0, W, CONFIG.canvas.height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = P.alertRed;
      ctx.fillText(`STAGE ${String(getSession().stage).padStart(2, '0')} CLEAR`, W / 2, 48);

      // Reveal kills in reading order across players.
      let budget = revealed;
      const shown = rows.map((r) => {
        const counts = {};
        for (const type of TYPES) {
          const take = Math.min(r.counts[type], budget);
          counts[type] = take;
          budget -= take;
        }
        return counts;
      });

      rows.forEach((row, pi) => {
        const x = rows.length === 2 ? (pi === 0 ? W / 4 : (3 * W) / 4) : W / 2;
        ctx.font = '14px monospace';
        ctx.fillStyle = pi === 0 ? P.playerYellow : P.playerGreen;
        ctx.fillText(`PLAYER ${row.playerId}`, x, 90);
        ctx.fillStyle = P.white;
        TYPES.forEach((type, ti) => {
          const n = shown[pi][type];
          const pts = n * CONFIG.tank.enemy[type].points;
          ctx.fillText(
            `${type.toUpperCase().padEnd(6)} ${String(n).padStart(2)} x ${String(pts).padStart(4)}`,
            x,
            124 + ti * 26
          );
        });
        if (revealed >= totalUnits) {
          ctx.fillStyle = P.playerYellow;
          ctx.fillText(`TOTAL ${row.totalKills} KILLS  ${row.totalPoints} PTS`, x, 240);
          if (row.killLeaderBonus > 0) {
            ctx.fillStyle = P.alertRed;
            ctx.fillText(`KILL LEADER +${row.killLeaderBonus}`, x, 266);
          }
          ctx.fillStyle = P.uiGray;
          ctx.fillText(`SCORE ${getSession().players[pi].score}`, x, 292);
        }
      });

      if (revealed >= totalUnits && Math.floor(time * 2) % 2 === 0) {
        ctx.fillStyle = P.uiGray;
        ctx.font = '12px monospace';
        ctx.fillText('FIRE TO CONTINUE', W / 2, 340);
      }
    },
  };
}
