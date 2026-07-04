import { describe, it, expect } from 'vitest';
import { createAudio } from '../src/audio/audio.js';
import { createEventBus } from '../src/engine/bullets.js';

// Node has no AudioContext; the module must guard every touch of it.
describe('audio in a headless env', () => {
  it('subscribes and receives events without throwing', () => {
    const bus = createEventBus();
    const audio = createAudio({ bus });
    expect(audio.unlocked).toBe(false);

    expect(() => {
      audio.unlock(); // no AudioContext available: stays locked
      for (const type of [
        'playerFired', 'brickHit', 'steelClang', 'bulletCancel', 'tankHit',
        'tankDestroyed', 'baseDestroyed', 'powerupSpawned', 'powerupPickup',
        'enemySpawn', 'pauseToggled', 'tallyTick', 'extraLife',
      ]) {
        bus.emit(type, {});
      }
      audio.setHum('moving');
      audio.setHum('off');
      audio.setBaseAlarm(true);
      audio.setBaseAlarm(false);
      audio.playTitleJingle();
      audio.setMasterVolume(0.3);
    }).not.toThrow();

    expect(audio.unlocked).toBe(false);
    expect(audio.toggleMute()).toBe(true);
    expect(audio.toggleMute()).toBe(false);
    expect(() => audio.dispose()).not.toThrow();
  });

  it('drops events silently after dispose', () => {
    const bus = createEventBus();
    const audio = createAudio({ bus });
    audio.dispose();
    expect(() => bus.emit('brickHit', {})).not.toThrow();
  });
});
