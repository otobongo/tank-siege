/**
 * Game state manager: session flow, progression, loop logic, tally.
 *
 * Stage lifecycle: STAGE_INTRO (curtain) -> PLAYING -> clear -> short
 * hold -> TALLY -> next stage. baseDestroyed or all players out ->
 * GAME_OVER (slide, then title on input). Screens (TS-019) render
 * these states; this module drives the transitions and the numbers.
 *
 * Public interface (owned by TS-014):
 *   resolveStage(stageNumber, stages) -> { id, layout, enemies,
 *     spawnInterval, loop } // looped stages keep their layout but use
 *                           // stage 35's roster + interval
 *   createProgression({ session, bus }) -> {
 *     beginStage(), stageKills, awardPoints(playerId, pts),
 *     dispose()
 *   }
 *   computeTally(session, stageKills) -> per-player tally rows
 *   createStageFlow({ machine, session, bus, config? }) -> {
 *     update(dt), startCampaign(startStage), stageClear pending etc.
 *   }
 */

import { CONFIG } from '../core/config.js';
import { STATES } from '../core/state.js';

/**
 * Resolve what stage N plays. 1-based, unbounded: after the campaign
 * length (35), layouts wrap but every looped stage uses the FINAL
 * stage's enemies roster and spawn interval (plan section 2).
 *
 * @param {number} stageNumber 1-based running stage counter
 * @param {Array<{id, layout, enemies, spawnInterval}>} stages ordered
 * @returns {{ id, layout, enemies, spawnInterval, loop }}
 */
export function resolveStage(stageNumber, stages) {
  const count = stages.length;
  const loop = Math.floor((stageNumber - 1) / count);
  const layoutStage = stages[(stageNumber - 1) % count];
  const rosterStage = loop === 0 ? layoutStage : stages[count - 1];
  return {
    id: stageNumber,
    layout: layoutStage.layout,
    enemies: rosterStage.enemies,
    spawnInterval: rosterStage.spawnInterval,
    loop,
  };
}

/**
 * Scoring, kills, and the extra-life ladder. Subscribes to
 * `tankDestroyed` (kill points to the shooter) and `powerupPickup` is
 * already scored by TS-013 directly; extra-life checks run on every
 * score change through awardPoints.
 */
export function createProgression({ session, bus }) {
  const blankKills = () => ({ basic: 0, fast: 0, power: 0, heavy: 0 });
  let stageKills = session.players.map(blankKills);

  function playerById(id) {
    return session.players.find((p) => p.id === id) ?? null;
  }

  function awardPoints(playerId, points) {
    const p = playerById(playerId);
    if (!p) return;
    p.score += points;
    // +1 life at each 20,000 threshold, exactly once per threshold.
    while (p.score >= p.nextLifeAt) {
      p.lives++;
      p.nextLifeAt += CONFIG.scoring.extraLifeAt;
      bus.emit('extraLife', { playerId });
    }
  }

  const offDestroyed = bus.on('tankDestroyed', ({ type, points, byPlayerId }) => {
    const p = playerById(byPlayerId);
    if (!p) return; // environmental death (grenade wipes emit nothing)
    p.kills[type]++;
    stageKills[session.players.indexOf(p)][type]++;
    awardPoints(byPlayerId, points);
  });

  return {
    get stageKills() {
      return stageKills;
    },
    beginStage() {
      stageKills = session.players.map(blankKills);
    },
    awardPoints,
    dispose() {
      offDestroyed();
    },
  };
}

/**
 * Tally rows for the stage-clear screen. In co-op the stage's kill
 * leader (total kills this stage) earns +1000; ties award nobody, as a
 * shared crown is no crown.
 *
 * @returns {Array<{ playerId, counts, points, totalKills, totalPoints,
 *                   killLeaderBonus }>}
 */
export function computeTally(session, stageKills) {
  const rows = session.players.map((p, i) => {
    const counts = stageKills[i];
    const points = {};
    let totalKills = 0;
    let totalPoints = 0;
    for (const [type, n] of Object.entries(counts)) {
      const pts = n * CONFIG.tank.enemy[type].points;
      points[type] = pts;
      totalKills += n;
      totalPoints += pts;
    }
    return { playerId: p.id, counts, points, totalKills, totalPoints, killLeaderBonus: 0 };
  });

  if (rows.length === 2) {
    const [a, b] = rows;
    if (a.totalKills !== b.totalKills) {
      const leader = a.totalKills > b.totalKills ? a : b;
      leader.killLeaderBonus = CONFIG.scoring.coopKillLeaderBonus;
    }
  }
  return rows;
}

const STAGE_CLEAR_HOLD = 2.0; // seconds between last kill and the tally
const INTRO_DURATION = 2.0;

/**
 * Drives machine transitions for a campaign. The per-stage WORLD
 * (grid, spawner, tanks...) is assembled by the caller via callbacks;
 * this keeps flow logic unit-testable without a full game.
 *
 * @param {{ machine, session, bus,
 *           onStageStart?: (resolved) => void,  // build the world
 *           onTallyApply?: (rows) => void,      // bank kill-leader bonus
 *           stages: Array }} opts
 */
export function createStageFlow({ machine, session, bus, stages, onStageStart, onTallyApply }) {
  const progression = createProgression({ session, bus });
  let introTimer = 0;
  let clearHoldTimer = 0;
  let gameOverPending = false;
  let stageCleared = false;

  const offBase = bus.on('baseDestroyed', () => {
    gameOverPending = true;
  });

  const flow = {
    progression,
    get currentStage() {
      return resolveStage(session.stage, stages);
    },

    startCampaign(startStage = 1) {
      session.stage = startStage;
      flow.enterStageIntro();
    },

    enterStageIntro() {
      progression.beginStage();
      stageCleared = false;
      gameOverPending = false;
      introTimer = INTRO_DURATION;
      onStageStart?.(flow.currentStage);
      machine.transition(STATES.STAGE_INTRO, { stage: session.stage });
    },

    /** Signal from the spawner/world: all 20 defeated, field empty. */
    notifyStageClear() {
      if (!stageCleared) {
        stageCleared = true;
        clearHoldTimer = STAGE_CLEAR_HOLD;
      }
    },

    /** Signal: every player is out of lives. */
    notifyAllPlayersOut() {
      gameOverPending = true;
    },

    /** Tally screen confirmed (fire/start): advance the campaign. */
    advanceFromTally() {
      session.stage++;
      flow.enterStageIntro();
    },

    /** Per-tick driving; call from the active state's update. */
    update(dt) {
      if (gameOverPending && machine.current !== STATES.GAME_OVER) {
        machine.transition(STATES.GAME_OVER);
        return;
      }
      switch (machine.current) {
        case STATES.STAGE_INTRO:
          introTimer -= dt;
          if (introTimer <= 0) machine.transition(STATES.PLAYING);
          break;
        case STATES.PLAYING:
          if (stageCleared) {
            clearHoldTimer -= dt;
            if (clearHoldTimer <= 0) {
              const rows = computeTally(session, progression.stageKills);
              for (const row of rows) {
                if (row.killLeaderBonus) progression.awardPoints(row.playerId, row.killLeaderBonus);
              }
              onTallyApply?.(rows);
              machine.transition(STATES.TALLY, { rows });
            }
          }
          break;
        default:
          break;
      }
    },

    dispose() {
      progression.dispose();
      offBase();
    },
  };

  return flow;
}
