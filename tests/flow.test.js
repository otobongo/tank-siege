import { describe, it, expect } from 'vitest';
import {
  resolveStage,
  createProgression,
  computeTally,
  createStageFlow,
} from '../src/systems/flow.js';
import { createEventBus } from '../src/engine/bullets.js';
import { createSession, createStateMachine, STATES } from '../src/core/state.js';

const DT = 1 / 60;

/** 35 distinguishable fake stages. */
function fakeStages() {
  return Array.from({ length: 35 }, (_, i) => ({
    id: i + 1,
    layout: [`layout-${i + 1}`],
    enemies: (i === 34 ? 'h' : 'b').repeat(20).split(''),
    spawnInterval: i === 34 ? 0.8 : 3.0 - i * 0.05,
  }));
}

describe('resolveStage loop rule', () => {
  const stages = fakeStages();

  it('stages 1-35 use their own data', () => {
    expect(resolveStage(1, stages)).toMatchObject({
      layout: ['layout-1'],
      spawnInterval: 3.0,
      loop: 0,
    });
    expect(resolveStage(35, stages).enemies[0]).toBe('h');
  });

  it('stage 36 uses layout 1 with stage 35 roster/interval; 71 likewise', () => {
    const s36 = resolveStage(36, stages);
    expect(s36.layout).toEqual(['layout-1']);
    expect(s36.enemies[0]).toBe('h');
    expect(s36.spawnInterval).toBe(0.8);
    expect(s36.loop).toBe(1);

    const s71 = resolveStage(71, stages);
    expect(s71.layout).toEqual(['layout-1']);
    expect(s71.enemies[0]).toBe('h');
    expect(s71.loop).toBe(2);

    const s40 = resolveStage(40, stages);
    expect(s40.layout).toEqual(['layout-5']); // keeps its own layout
    expect(s40.spawnInterval).toBe(0.8); // but stage 35 pacing
  });
});

describe('extra life ladder', () => {
  it('crossing 20,000 grants exactly one life; not again at 20,100', () => {
    const session = createSession(1);
    const bus = createEventBus();
    const prog = createProgression({ session, bus });
    const p = session.players[0];

    prog.awardPoints(1, 19900);
    expect(p.lives).toBe(3);
    prog.awardPoints(1, 200); // crosses 20,000
    expect(p.lives).toBe(4);
    prog.awardPoints(1, 100); // 20,200: same threshold, no second life
    expect(p.lives).toBe(4);
    prog.awardPoints(1, 20000); // crosses 40,000
    expect(p.lives).toBe(5);
  });

  it('a single huge award can cross two thresholds', () => {
    const session = createSession(1);
    const prog = createProgression({ session, bus: createEventBus() });
    prog.awardPoints(1, 41000);
    expect(session.players[0].lives).toBe(5);
  });
});

describe('kill attribution and tally', () => {
  function killEvent(type, byPlayerId) {
    const points = { basic: 100, fast: 200, power: 300, heavy: 400 }[type];
    return { type, points, byPlayerId };
  }

  it('tally math matches emitted kill events (seeded sim fixture)', () => {
    const session = createSession(2);
    const bus = createEventBus();
    const prog = createProgression({ session, bus });
    prog.beginStage();

    // Fixture: P1 kills 3 basic + 1 heavy, P2 kills 2 fast.
    for (const e of [
      killEvent('basic', 1), killEvent('basic', 1), killEvent('basic', 1),
      killEvent('heavy', 1), killEvent('fast', 2), killEvent('fast', 2),
    ]) {
      bus.emit('tankDestroyed', e);
    }

    const rows = computeTally(session, prog.stageKills);
    expect(rows[0]).toMatchObject({
      playerId: 1,
      counts: { basic: 3, fast: 0, power: 0, heavy: 1 },
      points: { basic: 300, fast: 0, power: 0, heavy: 400 },
      totalKills: 4,
      totalPoints: 700,
      killLeaderBonus: 1000, // 4 kills vs 2
    });
    expect(rows[1].totalPoints).toBe(400);
    expect(rows[1].killLeaderBonus).toBe(0);
    // Scores banked as the events landed.
    expect(session.players[0].score).toBe(700);
    expect(session.players[1].score).toBe(400);
  });

  it('tied kill counts award no leader bonus; 1P never gets one', () => {
    const session2 = createSession(2);
    const bus2 = createEventBus();
    const prog2 = createProgression({ session: session2, bus: bus2 });
    bus2.emit('tankDestroyed', killEvent('basic', 1));
    bus2.emit('tankDestroyed', killEvent('heavy', 2));
    const rows = computeTally(session2, prog2.stageKills);
    expect(rows[0].killLeaderBonus).toBe(0);
    expect(rows[1].killLeaderBonus).toBe(0);

    const session1 = createSession(1);
    const prog1 = createProgression({ session: session1, bus: createEventBus() });
    const rows1 = computeTally(session1, prog1.stageKills);
    expect(rows1).toHaveLength(1);
    expect(rows1[0].killLeaderBonus).toBe(0);
  });

  it('kills with no player attribution score nobody', () => {
    const session = createSession(1);
    const bus = createEventBus();
    createProgression({ session, bus });
    bus.emit('tankDestroyed', { type: 'basic', points: 100, byPlayerId: null });
    expect(session.players[0].score).toBe(0);
  });
});

describe('stage flow transitions', () => {
  function makeFlow(playerCount = 1) {
    const session = createSession(playerCount);
    const bus = createEventBus();
    const noop = {};
    const machine = createStateMachine(
      {
        TITLE: noop, STAGE_INTRO: noop, PLAYING: noop,
        PAUSED: noop, TALLY: noop, GAME_OVER: noop,
      },
      STATES.TITLE
    );
    const flow = createStageFlow({ machine, session, bus, stages: fakeStages() });
    return { flow, machine, session, bus };
  }

  function run(flow, seconds) {
    for (let i = 0; i < Math.ceil(seconds / DT); i++) flow.update(DT);
  }

  it('runs STAGE_INTRO -> PLAYING -> TALLY -> next STAGE_INTRO', () => {
    const { flow, machine, session } = makeFlow();
    flow.startCampaign(1);
    expect(machine.current).toBe(STATES.STAGE_INTRO);
    run(flow, 2.5);
    expect(machine.current).toBe(STATES.PLAYING);

    flow.notifyStageClear();
    run(flow, 2.5);
    expect(machine.current).toBe(STATES.TALLY);

    flow.advanceFromTally();
    expect(session.stage).toBe(2);
    expect(machine.current).toBe(STATES.STAGE_INTRO);
  });

  it('tier persists across TALLY -> STAGE_INTRO', () => {
    const { flow, session } = makeFlow();
    flow.startCampaign(1);
    run(flow, 2.5);
    session.players[0].tier = 3;
    flow.notifyStageClear();
    run(flow, 2.5);
    flow.advanceFromTally();
    expect(session.players[0].tier).toBe(3); // only death resets tier
  });

  it('baseDestroyed forces GAME_OVER regardless of lives', () => {
    const { flow, machine, bus, session } = makeFlow();
    flow.startCampaign(1);
    run(flow, 2.5);
    session.players[0].lives = 99;
    bus.emit('baseDestroyed', {});
    flow.update(DT);
    expect(machine.current).toBe(STATES.GAME_OVER);
  });

  it('all players out forces GAME_OVER', () => {
    const { flow, machine } = makeFlow(2);
    flow.startCampaign(1);
    run(flow, 2.5);
    flow.notifyAllPlayersOut();
    flow.update(DT);
    expect(machine.current).toBe(STATES.GAME_OVER);
  });

  it('kill-leader bonus lands on the leader score at tally time', () => {
    const { flow, machine, bus, session } = makeFlow(2);
    flow.startCampaign(1);
    run(flow, 2.5);
    bus.emit('tankDestroyed', { type: 'basic', points: 100, byPlayerId: 2 });
    flow.notifyStageClear();
    run(flow, 2.5);
    expect(machine.current).toBe(STATES.TALLY);
    expect(session.players[1].score).toBe(100 + 1000);
  });
});
