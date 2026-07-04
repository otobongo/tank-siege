/**
 * Tank Siege bootstrap and orchestration.
 *
 * Owns the canvas, the fixed-step loop, the state machine wiring, and
 * the per-stage world assembly (grid, base, players, enemies, AI,
 * bullets, power-ups, co-op). Systems talk through the event bus and
 * the interfaces defined by their owning issues; this file only wires.
 */

import { CONFIG } from './core/config.js';
import { createLoop } from './core/loop.js';
import { createStateMachine, createSession, STATES } from './core/state.js';
import { createInputHub } from './input/actions.js';
import { createKeyboard } from './input/keyboard.js';
import { createGamepads } from './input/gamepad.js';
import { createGrid } from './engine/grid.js';
import { createEventBus, createBulletSystem } from './engine/bullets.js';
import { createPlayer } from './entities/player.js';
import { createEnemy } from './entities/enemy.js';
import { createBase } from './entities/base.js';
import { createAI, createRng } from './ai/ai.js';
import { createSpawner } from './systems/spawner.js';
import { createPowerupSystem } from './systems/powerups.js';
import { createCoop, playerImpact } from './systems/coop.js';
import { createStageFlow } from './systems/flow.js';
import { createAudio } from './audio/audio.js';
import { createSpriteAtlas } from './render/sprites.js';
import { createRenderer } from './render/renderer.js';
import { drawHud } from './render/hud.js';
import { createParticles } from './render/particles.js';
import { createCrt } from './render/crt.js';
import { createTitleScreen } from './screens/title.js';
import { createStageIntroScreen } from './screens/stageIntro.js';
import { createTallyScreen } from './screens/tally.js';
import { createGameOverScreen } from './screens/gameover.js';
import { createPauseScreen } from './screens/pause.js';
import stages from './stages/index.js';

// ---------- canvas ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function fitCanvas() {
  const scaleX = Math.floor(window.innerWidth / CONFIG.canvas.width);
  const scaleY = Math.floor(window.innerHeight / CONFIG.canvas.height);
  const scale = Math.max(1, Math.min(scaleX, scaleY));
  canvas.style.width = `${CONFIG.canvas.width * scale}px`;
  canvas.style.height = `${CONFIG.canvas.height * scale}px`;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// ---------- singletons ----------
const bus = createEventBus();
const atlas = createSpriteAtlas();
const renderer = createRenderer({ ctx, atlas });
const crt = createCrt();
const audio = createAudio({ bus });
const particles = createParticles({
  bus,
  getPads: () => (navigator.getGamepads ? navigator.getGamepads() : []),
});

const keyboard = createKeyboard();
keyboard.attach();
const gamepads = createGamepads();
gamepads.attach();
const hub = createInputHub({ keyboard, gamepads, playerCount: 2 });

let toast = null;
let toastTimer = 0;
hub.onAssignmentChange((assignments) => {
  const withPad = assignments.filter((a) => a.pad !== null);
  toast =
    withPad.length > 0
      ? `CONTROLLER CONNECTED: P${withPad[withPad.length - 1].player}`
      : 'CONTROLLER DISCONNECTED';
  toastTimer = 3;
});

// First-gesture audio unlock + global toggles (mute, CRT).
window.addEventListener('pointerdown', () => audio.unlock(), { once: false });
window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.code === CONFIG.input.keyboard.mute) audio.toggleMute();
  if (e.code === 'KeyC') crt.toggle();
});

// ---------- session / world state ----------
let session = createSession(1);
let flow = null;
let world = null; // per-stage entities
let maxStageReached = 1;
let time = 0;
let alarmCheckTimer = 0;

function disposeWorld() {
  if (!world) return;
  world.base.dispose();
  world.powerups.dispose();
  world.coop.dispose();
  world = null;
}

function anyTankAt(rect) {
  const tanks = [
    ...world.players.filter((p) => p.tank.state !== 'dead').map((p) => p.tank.rect),
    ...world.enemies.filter((e) => !e.dead).map((e) => e.rect),
  ];
  return tanks.some(
    (t) => rect.x < t.x + t.w && rect.x + rect.w > t.x && rect.y < t.y + t.h && rect.y + rect.h > t.y
  );
}

function buildWorld(resolved) {
  disposeWorld();
  const grid = createGrid(resolved.layout);
  renderer.setGrid(grid);

  const base = createBase({ grid, bus, onDestroyed: null }); // flow hears baseDestroyed
  const players = session.players.map((sp, i) =>
    createPlayer({ playerId: sp.id, sessionPlayer: sp, actions: hub.players[i] })
  );
  const enemies = [];
  const bullets = createBulletSystem({ grid, bus });
  const rng = createRng(session.rngSeed + session.stage * 7919);
  const ai = createAI({ grid, rng });

  const spawner = createSpawner({
    stage: resolved,
    playerCount: session.playerCount,
    bus,
    isBlockedAt: (rect) => anyTankAt(rect),
    onSpawn: (desc) => {
      const enemy = createEnemy({ type: desc.type, x: desc.x, y: desc.y, bonus: desc.bonus, bus });
      enemies.push(enemy);
      ai.register(enemy);
    },
  });

  const coop = createCoop({
    bus,
    players,
    actionsFor: (id) => hub.players[id - 1],
    onAllPlayersOut: () => flow.notifyAllPlayersOut(),
  });

  const powerups = createPowerupSystem({
    grid,
    bus,
    rng,
    base,
    players,
    getFieldEnemies: () => enemies.filter((e) => !e.dead),
  });

  world = { grid, base, players, enemies, bullets, ai, spawner, coop, powerups };
}

// Route bullet impacts on enemies into their HP model.
bus.on('tankHit', ({ target, bullet }) => {
  if (target?.ref?.kind === 'enemy') {
    target.ref.takeHit({ byPlayerId: bullet.ownerPlayerId });
  }
});

function startGame(playerCount, stage) {
  session = createSession(playerCount);
  session.rngSeed = (Date.now() % 100000) | 1;
  flow?.dispose();
  flow = createStageFlow({
    machine,
    session,
    bus,
    stages,
    onStageStart: (resolved) => buildWorld(resolved),
  });
  flow.startCampaign(stage);
}

// ---------- per-tick simulation while PLAYING ----------
function updatePlaying(dt) {
  const w = world;
  if (!w) return;

  // Pause on edge (keyboard Escape/Enter, pad Start).
  if (hub.players.some((a) => a.justPressed('pause') || a.justPressed('start'))) {
    bus.emit('pauseToggled', {});
    machine.transition(STATES.PAUSED);
    return;
  }

  flow.update(dt);
  if (machine.current !== STATES.PLAYING) return;

  // Players.
  for (const player of w.players) {
    const others = [
      ...w.players.filter((p) => p !== player && p.tank.state !== 'dead').map((p) => p.tank.rect),
      ...w.enemies.filter((e) => !e.dead && e.tank.state === 'alive').map((e) => e.rect),
    ];
    const req = player.update(dt, { grid: w.grid, blockers: others });
    if (req) {
      w.bullets.spawn({ ...req, side: 'player' });
      bus.emit('playerFired', { playerId: player.id });
      particles.spawnMuzzleFlash(req.x + 4, req.y + 4, req.dir);
    }
  }
  w.coop.update(dt);

  // Enemies: AI drives, timers tick, corpses leave the field.
  const playerRects = w.players.filter((p) => p.tank.state === 'alive').map((p) => p.tank.rect);
  w.ai.update(dt, {
    playerRects,
    baseRect: w.base.rect,
    blockersFor: (enemy) => [
      ...playerRects,
      ...w.enemies.filter((e) => e !== enemy && !e.dead && e.tank.state === 'alive').map((e) => e.rect),
    ],
    fire: (req) => w.bullets.spawn(req),
  });
  for (let i = w.enemies.length - 1; i >= 0; i--) {
    const enemy = w.enemies[i];
    enemy.update(dt);
    if (enemy.dead) {
      w.enemies.splice(i, 1);
      w.ai.unregister(enemy);
      w.spawner.noteEnemyRemoved();
    }
  }

  // Combat resolution.
  const targets = [
    ...w.players.map((p) => ({ rect: p.tank.rect, ref: p, side: 'player', impact: playerImpact(p) })),
    ...w.enemies.map((e) => ({ rect: e.rect, ref: e, side: 'enemy', impact: e.impact })),
  ];
  w.bullets.update(dt, { targets });

  w.powerups.update(dt);
  w.spawner.update(dt);
  if (w.spawner.allDefeated) flow.notifyStageClear();

  // Audio hum tracks P1's treads; base alarm tracks ring integrity.
  audio.setHum(w.players[0]?.tank.moving ? 'moving' : 'idle');
  alarmCheckTimer -= dt;
  if (alarmCheckTimer <= 0) {
    alarmCheckTimer = 0.25;
    let breached = false;
    for (const { col, row } of w.grid.ringBlocks) {
      if (w.grid.halfCellAt(col * 2, row * 2) === 'S') continue; // fortified
      for (let qr = row * 4; qr < row * 4 + 4 && !breached; qr++) {
        for (let qc = col * 4; qc < col * 4 + 4; qc++) {
          if (!w.grid.brickQuarterAt(qc, qr)) {
            breached = true;
            break;
          }
        }
      }
      if (breached) break;
    }
    audio.setBaseAlarm(breached && !w.base.destroyed);
  }
}

function renderWorld() {
  if (!world) {
    ctx.fillStyle = CONFIG.palette.black;
    ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
    return;
  }
  renderer.render({
    grid: world.grid,
    time,
    shakeOffset: particles.getShakeOffset(),
    base: world.base,
    players: world.players,
    enemies: world.enemies,
    bullets: world.bullets.bullets,
    powerup: world.powerups.current,
    particles,
    hud: (c) =>
      drawHud(c, atlas, {
        remaining: world.spawner.remaining,
        players: world.coop.hudData(),
        stage: session.stage,
        loop: flow ? flow.currentStage.loop : 0,
      }),
  });
}

// ---------- screens / state machine ----------
const titleScreen = createTitleScreen({
  ctx,
  actions: hub.players[0],
  getMaxStage: () => Math.min(maxStageReached, stages.length),
  onStart: ({ players, stage }) => startGame(players, stage),
  getToast: () => (toastTimer > 0 ? toast : null),
});

const introScreen = createStageIntroScreen({
  ctx,
  getStage: () => session.stage,
  renderWorld,
});

const tallyScreen = createTallyScreen({
  ctx,
  bus,
  actions: hub.players[0],
  getSession: () => session,
  onAdvance: () => {
    maxStageReached = Math.max(maxStageReached, Math.min(session.stage + 1, stages.length));
    flow.advanceFromTally();
  },
});

const gameOverScreen = createGameOverScreen({
  ctx,
  actions: hub.players[0],
  renderWorld,
  onDone: () => {
    audio.setHum('off');
    audio.setBaseAlarm(false);
    disposeWorld();
    machine.transition(STATES.TITLE);
  },
});

const pauseScreen = createPauseScreen({ ctx, renderWorld });

const machine = createStateMachine(
  {
    TITLE: {
      enter: () => {
        titleScreen.enter();
        audio.setHum('off');
        audio.playTitleJingle();
      },
      update: (dt) => titleScreen.update(dt),
      render: () => titleScreen.render(),
    },
    STAGE_INTRO: {
      enter: (payload) => introScreen.enter(payload),
      update: (dt) => {
        introScreen.update(dt);
        flow.update(dt);
      },
      render: () => introScreen.render(),
    },
    PLAYING: {
      update: updatePlaying,
      render: renderWorld,
    },
    PAUSED: {
      enter: () => {
        pauseScreen.enter();
        audio.setHum('off');
      },
      update: (dt) => {
        pauseScreen.update(dt);
        if (hub.players.some((a) => a.justPressed('pause') || a.justPressed('start'))) {
          bus.emit('pauseToggled', {});
          machine.transition(STATES.PLAYING);
        }
      },
      render: () => pauseScreen.render(),
    },
    TALLY: {
      enter: (payload) => {
        tallyScreen.enter(payload);
        audio.setHum('off');
        audio.setBaseAlarm(false);
      },
      update: (dt) => tallyScreen.update(dt),
      render: () => tallyScreen.render(),
    },
    GAME_OVER: {
      enter: () => {
        gameOverScreen.enter();
        audio.setHum('off');
        audio.setBaseAlarm(false);
      },
      update: (dt) => gameOverScreen.update(dt),
      render: () => gameOverScreen.render(),
    },
  },
  STATES.TITLE
);

// ---------- loop ----------
let hitStopRemaining = 0;

const loop = createLoop({
  update: (dt) => {
    hub.update();
    time += dt;
    if (toastTimer > 0) toastTimer -= dt;

    hitStopRemaining += particles.consumeHitStopFrames();
    if (hitStopRemaining > 0 && machine.current === STATES.PLAYING) {
      hitStopRemaining--;
    } else {
      machine.update(dt);
    }
    particles.update(dt);
  },
  render: () => {
    machine.render(ctx);
    crt.apply(ctx);
  },
});

loop.start();

// Devtools handle for manual QA only.
window.__tankSiege = {
  get session() {
    return session;
  },
  get world() {
    return world;
  },
  machine,
  crt,
  audio,
  hub,
  keyboard,
  /** Manual QA driver for environments where rAF is throttled. */
  step(ticks = 1) {
    const dt = 1 / CONFIG.simulation.updateHz;
    for (let i = 0; i < ticks; i++) {
      hub.update();
      time += dt;
      if (toastTimer > 0) toastTimer -= dt;
      machine.update(dt);
      particles.update(dt);
    }
    machine.render(ctx);
    crt.apply(ctx);
  },
};
