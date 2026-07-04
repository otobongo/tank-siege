/**
 * WebAudio synthesized SFX and mixer. No audio files: every voice is
 * built from oscillators, noise buffers, and envelopes at play time.
 *
 * Zero coupling into game logic: this module only subscribes to the
 * event bus. Everything is gated behind the first user gesture
 * (autoplay policy): call unlock() from any input handler; events
 * arriving before that are silently dropped. All AudioContext access
 * is guarded so the module is safe to create in a headless env.
 *
 * Voices (plan TS-015): fire blip, brick crunch, steel clang (FM),
 * tank explosion, base explosion (layered), power-up spawn arpeggio,
 * pickup chime, spawn sparkle, pause blip, tally tick, extra-life
 * chime, engine hum (idle/moving, player only), base alarm loop
 * (modern addition, subtle), ~4s original title jingle.
 *
 * Public interface (owned by TS-015):
 *   createAudio({ bus }) -> {
 *     unlock(), toggleMute() -> muted, muted, unlocked,
 *     setHum('off'|'idle'|'moving'), setBaseAlarm(on),
 *     setMasterVolume(v), playTitleJingle(), dispose()
 *   }
 */

import { CONFIG } from '../core/config.js';

function getAudioContextCtor() {
  if (typeof AudioContext !== 'undefined') return AudioContext;
  if (typeof window !== 'undefined' && window.webkitAudioContext) return window.webkitAudioContext;
  return null;
}

export function createAudio({ bus }) {
  const Ctor = getAudioContextCtor();
  let ctx = null;
  let master = null;
  let muted = false;

  // Continuous voices.
  let hum = null; // { osc1, osc2, gain }
  let humMode = 'off';
  let alarm = null; // { osc, gain, lfo }

  function unlock() {
    if (!Ctor || ctx) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : CONFIG.audio.masterGain;
    master.connect(ctx.destination);
    if (humMode !== 'off') startHum();
  }

  const ready = () => ctx !== null && !muted;

  /** One-shot oscillator with a linear pitch ramp and decay envelope. */
  function blip({ type = 'square', from = 880, to = 440, dur = 0.08, gain = 0.4, at = 0 }) {
    if (!ready()) return;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.linearRampToValueAtTime(Math.max(1, to), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** White-noise burst through a filter with a decay envelope. */
  function noise({ dur = 0.15, gain = 0.4, filterType = 'lowpass', freq = 1000, at = 0 }) {
    if (!ready()) return;
    const t0 = ctx.currentTime + at;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** Short FM ping: metallic steel clang. */
  function fmPing({ carrier = 1100, ratio = 3.7, index = 400, dur = 0.18, gain = 0.35 }) {
    if (!ready()) return;
    const t0 = ctx.currentTime;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const g = ctx.createGain();
    car.frequency.value = carrier;
    mod.frequency.value = carrier * ratio;
    modGain.gain.setValueAtTime(index, t0);
    modGain.gain.exponentialRampToValueAtTime(1, t0 + dur);
    mod.connect(modGain).connect(car.frequency);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    car.connect(g).connect(master);
    car.start(t0);
    mod.start(t0);
    car.stop(t0 + dur + 0.02);
    mod.stop(t0 + dur + 0.02);
  }

  function notes(seq, { type = 'square', noteDur = 0.09, gain = 0.3 } = {}) {
    seq.forEach((freq, i) => {
      if (freq > 0) blip({ type, from: freq, to: freq, dur: noteDur, gain, at: i * noteDur });
    });
  }

  // --- Named voices -------------------------------------------------

  const voices = {
    fire: () => blip({ from: 900, to: 500, dur: 0.06, gain: 0.25 }),
    brickHit: () => noise({ dur: 0.09, gain: 0.35, freq: 900 }),
    steelClang: () => fmPing({}),
    bulletCancel: () => blip({ from: 500, to: 300, dur: 0.05, gain: 0.15 }),
    tankHit: () => blip({ type: 'sawtooth', from: 300, to: 150, dur: 0.08, gain: 0.25 }),
    tankExplosion: () => {
      noise({ dur: 0.35, gain: 0.5, freq: 700 });
      blip({ type: 'triangle', from: 220, to: 40, dur: 0.35, gain: 0.4 });
    },
    baseExplosion: () => {
      noise({ dur: 0.9, gain: 0.6, freq: 400 });
      blip({ type: 'triangle', from: 160, to: 24, dur: 0.9, gain: 0.5 });
      noise({ dur: 0.5, gain: 0.4, freq: 1600, filterType: 'highpass', at: 0.15 });
    },
    powerupSpawn: () => notes([660, 880, 1100, 880, 660, 880, 1100]),
    powerupPickup: () => notes([880, 1320], { noteDur: 0.12, gain: 0.35 }),
    spawnSparkle: () => notes([1760, 2093, 1760], { type: 'triangle', noteDur: 0.06, gain: 0.15 }),
    pauseBlip: () => notes([1046, 784], { noteDur: 0.1 }),
    tallyTick: () => blip({ from: 1320, to: 1320, dur: 0.04, gain: 0.2 }),
    extraLife: () => notes([784, 988, 1175, 1568], { noteDur: 0.1, gain: 0.35 }),
  };

  // --- Engine hum (player only; idle vs moving pitch) ---------------

  function startHum() {
    if (!ctx || hum) return;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.type = 'triangle';
    osc2.type = 'sawtooth';
    gain.gain.value = 0.045;
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(master);
    osc1.start();
    osc2.start();
    hum = { osc1, osc2, gain };
    applyHumPitch();
  }

  function applyHumPitch() {
    if (!hum) return;
    const moving = humMode === 'moving';
    hum.osc1.frequency.value = moving ? 82 : 55;
    hum.osc2.frequency.value = moving ? 111 : 74;
  }

  function stopHum() {
    if (!hum) return;
    hum.osc1.stop();
    hum.osc2.stop();
    hum.gain.disconnect();
    hum = null;
  }

  // --- Base alarm loop (subtle) --------------------------------------

  function setBaseAlarm(on) {
    if (!ctx) return;
    if (on && !alarm) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 520;
      lfo.frequency.value = 2.2;
      lfoGain.gain.value = 90;
      lfo.connect(lfoGain).connect(osc.frequency);
      gain.gain.value = 0.05;
      osc.connect(gain).connect(master);
      osc.start();
      lfo.start();
      alarm = { osc, gain, lfo };
    } else if (!on && alarm) {
      alarm.osc.stop();
      alarm.lfo.stop();
      alarm.gain.disconnect();
      alarm = null;
    }
  }

  // --- Title jingle: short original composition (~4s) ----------------

  function playTitleJingle() {
    if (!ready()) return;
    // Original melody in A minor, march feel. NOT the Namco theme.
    const eighth = 0.16;
    const melody = [
      440, 0, 440, 523, 659, 0, 659, 587,
      523, 587, 659, 0, 523, 0, 440, 0,
      349, 440, 523, 659, 784, 0, 659, 523,
      587, 523, 494, 523, 440, 0, 440, 0,
    ];
    melody.forEach((freq, i) => {
      if (freq > 0) blip({ type: 'square', from: freq, to: freq, dur: eighth * 0.9, gain: 0.25, at: i * eighth });
    });
    // Simple root-fifth bass under it.
    const bass = [220, 0, 165, 0, 175, 0, 220, 0, 220, 0, 165, 0, 175, 0, 220, 0];
    bass.forEach((freq, i) => {
      if (freq > 0) blip({ type: 'triangle', from: freq, to: freq, dur: eighth * 1.8, gain: 0.2, at: i * eighth * 2 });
    });
  }

  // --- Event subscriptions -------------------------------------------

  const subs = [
    bus.on('playerFired', voices.fire),
    bus.on('brickHit', voices.brickHit),
    bus.on('steelClang', voices.steelClang),
    bus.on('bulletCancel', voices.bulletCancel),
    bus.on('tankHit', voices.tankHit),
    bus.on('tankDestroyed', voices.tankExplosion),
    bus.on('baseDestroyed', voices.baseExplosion),
    bus.on('powerupSpawned', voices.powerupSpawn),
    bus.on('powerupPickup', voices.powerupPickup),
    bus.on('enemySpawn', voices.spawnSparkle),
    bus.on('pauseToggled', voices.pauseBlip),
    bus.on('tallyTick', voices.tallyTick),
    bus.on('extraLife', voices.extraLife),
  ];

  return {
    get muted() {
      return muted;
    },
    get unlocked() {
      return ctx !== null;
    },
    unlock,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : CONFIG.audio.masterGain;
      return muted;
    },
    setMasterVolume(v) {
      if (master && !muted) master.gain.value = v;
    },
    /** @param {'off'|'idle'|'moving'} mode */
    setHum(mode) {
      humMode = mode;
      if (!ctx) return;
      if (mode === 'off') stopHum();
      else {
        startHum();
        applyHumPitch();
      }
    },
    setBaseAlarm,
    playTitleJingle,
    dispose() {
      for (const off of subs) off();
      stopHum();
      setBaseAlarm(false);
      if (ctx) ctx.close();
      ctx = null;
    },
  };
}
