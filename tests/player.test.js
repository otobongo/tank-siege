import { describe, it, expect, beforeEach } from 'vitest';
import { createPlayer, playerSpawnPoint } from '../src/entities/player.js';
import { createActionState } from '../src/input/actions.js';
import { createGrid } from '../src/engine/grid.js';
import { createSession } from '../src/core/state.js';
import { CONFIG } from '../src/core/config.js';

const DT = 1 / 60;

function emptyLayout() {
  return Array.from({ length: 13 }, () => '.'.repeat(13));
}

function makePlayer(playerId = 1) {
  const session = createSession(2);
  const actions = createActionState();
  const player = createPlayer({
    playerId,
    sessionPlayer: session.players[playerId - 1],
    actions,
  });
  return { player, actions, session, grid: createGrid(emptyLayout()) };
}

/** Run ticks until the tank finishes its spawn animation. */
function finishSpawn(player, grid) {
  while (player.tank.state === 'spawning') player.update(DT, { grid });
}

function press(actions, action) {
  actions.set(action, true);
  actions.commit();
}

function release(actions) {
  actions.clearLive();
  actions.commit();
}

describe('player firing', () => {
  let ctx;
  beforeEach(() => {
    ctx = makePlayer();
    finishSpawn(ctx.player, ctx.grid);
  });

  function fireOnce(expectBullet) {
    press(ctx.actions, 'fire');
    const req = ctx.player.update(DT, { grid: ctx.grid });
    release(ctx.actions);
    ctx.player.update(DT, { grid: ctx.grid });
    if (expectBullet) expect(req).not.toBeNull();
    return req;
  }

  it('respects the in-flight cap per tier (1,1,2,2)', () => {
    for (const [tier, cap] of [ [1, 1], [2, 1], [3, 2], [4, 2] ]) {
      ctx.player.setTier(tier);
      ctx.player.tank.bulletsInFlight = 0;
      // Fire until refused; wait out the cooldown between shots.
      let fired = 0;
      for (let attempt = 0; attempt < 5; attempt++) {
        for (let i = 0; i < 20; i++) ctx.player.update(DT, { grid: ctx.grid }); // cooldown
        if (fireOnce(false)) fired++;
      }
      expect(fired, `tier ${tier}`).toBe(cap);
    }
  });

  it('frees the slot when the bullet terminates', () => {
    fireOnce(true);
    expect(ctx.player.tank.bulletsInFlight).toBe(1);
    ctx.player.tank.releaseBullet();
    for (let i = 0; i < 20; i++) ctx.player.update(DT, { grid: ctx.grid });
    expect(fireOnce(false)).not.toBeNull();
  });

  it('bullet request carries tier data', () => {
    ctx.player.setTier(4);
    const req = fireOnce(true);
    expect(req.destroySteel).toBe(true);
    expect(req.depth).toBe(CONFIG.tank.player.brickDepthByTier[4]);
    expect(req.speed).toBe(CONFIG.tank.player.bulletSpeedByTier[4]);
    expect(req.ownerPlayerId).toBe(1);
  });
});

describe('player death and respawn', () => {
  it('death resets tier to 1 and decrements lives', () => {
    const { player, grid } = makePlayer();
    finishSpawn(player, grid);
    player.setTier(3);
    const result = player.die();
    expect(result).toBe('respawn');
    expect(player.tier).toBe(1);
    expect(player.lives).toBe(CONFIG.tank.player.startLives - 1);
    expect(player.tank.state).toBe('spawning');
    expect(player.invulnerable).toBe(true);
  });

  it('last life ends the player', () => {
    const { player } = makePlayer();
    player.session.lives = 1;
    expect(player.die()).toBe('out');
    expect(player.out).toBe(true);
  });

  it('respawn returns to the fixed point with a fresh shimmer', () => {
    const { player, grid, actions } = makePlayer(2);
    finishSpawn(player, grid);
    // Wait out the initial invulnerability, then drive away and die.
    for (let i = 0; i < 200; i++) player.update(DT, { grid });
    press(actions, 'up');
    for (let i = 0; i < 30; i++) player.update(DT, { grid });
    release(actions);
    expect(player.tank.rect.y).toBeLessThan(playerSpawnPoint(2).y);

    player.die();
    expect(player.tank.rect).toMatchObject(playerSpawnPoint(2));
    expect(player.tank.invulnTimer).toBeCloseTo(CONFIG.tank.player.spawnInvulnerability);
  });
});

describe('player movement', () => {
  it('moves at tier speed and stops at walls', () => {
    const { player, actions } = makePlayer();
    // Wall of steel across row 10 blocks upward travel from row 12.
    const grid = createGrid(
      Array.from({ length: 13 }, (_, r) => (r === 10 ? 'SSSSSSSSSSSSS' : '.'.repeat(13)))
    );
    finishSpawn(player, grid);
    press(actions, 'up');
    for (let i = 0; i < 600; i++) player.update(DT, { grid });
    // Steel row 10 occupies y 320..352; tank stops flush below it.
    expect(player.tank.rect.y).toBe(352);
  });

  it('is blocked by other tanks', () => {
    const { player, grid, actions } = makePlayer();
    finishSpawn(player, grid);
    const spawn = playerSpawnPoint(1);
    const blocker = { x: spawn.x, y: spawn.y - 64, w: 32, h: 32 };
    press(actions, 'up');
    for (let i = 0; i < 600; i++) player.update(DT, { grid, blockers: [blocker] });
    expect(player.tank.rect.y).toBe(blocker.y + 32);
  });

  it('frozen tank can rotate and fire but not move', () => {
    const { player, grid, actions } = makePlayer();
    finishSpawn(player, grid);
    player.tank.frozenTimer = 5;
    const y0 = player.tank.rect.y;
    press(actions, 'left');
    player.update(DT, { grid });
    expect(player.tank.facing).toBe('left');
    expect(player.tank.rect.y).toBe(y0);

    actions.set('fire', true);
    actions.commit();
    const req = player.update(DT, { grid });
    expect(req).not.toBeNull();
    expect(req.dir).toBe('left');
  });
});
