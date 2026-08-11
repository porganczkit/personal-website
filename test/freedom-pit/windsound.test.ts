import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../lib/freedom-pit/config';
import { windSoundParams } from '../../lib/freedom-pit/windsound';

const forces = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

describe('wind sound', () => {
  it('is silent in dead calm', () => {
    expect(windSoundParams(0).gain).toBe(0);
  });

  it('gets louder, brighter and faster-pulsing as the wind picks up', () => {
    const params = forces.map((f) => windSoundParams(f));
    for (let i = 1; i < params.length; i++) {
      expect(params[i].gain).toBeGreaterThan(params[i - 1].gain);
      expect(params[i].cutoff).toBeGreaterThan(params[i - 1].cutoff);
      expect(params[i].lfoRate).toBeGreaterThan(params[i - 1].lfoRate);
    }
  });

  it('never exceeds the ceiling, even mid-gust', () => {
    for (const f of forces) {
      expect(windSoundParams(f, true).gain).toBeLessThanOrEqual(CONFIG.audio.maxGain);
    }
  });

  it('is louder during a gust than at the same force without one', () => {
    expect(windSoundParams(0.5, true).gain).toBeGreaterThan(windSoundParams(0.5).gain);
  });

  it('keeps the pulse shallower than the level, so it never inverts phase', () => {
    // The LFO is summed onto the gain param; a depth above the base level would
    // drive it negative on every trough.
    for (const f of forces) {
      for (const gusting of [false, true]) {
        const p = windSoundParams(f, gusting);
        expect(p.lfoDepth).toBeLessThanOrEqual(p.gain);
      }
    }
  });

  it('stays inside the configured ranges across the whole sweep', () => {
    for (const f of forces) {
      const p = windSoundParams(f);
      expect(p.cutoff).toBeGreaterThanOrEqual(CONFIG.audio.minCutoff);
      expect(p.cutoff).toBeLessThanOrEqual(CONFIG.audio.maxCutoff);
      expect(p.lfoRate).toBeGreaterThanOrEqual(CONFIG.audio.minPulse);
      expect(p.lfoRate).toBeLessThanOrEqual(CONFIG.audio.maxPulse);
    }
  });

  it('survives nonsense input rather than driving the graph somewhere absurd', () => {
    for (const bad of [-5, 42, NaN, Infinity]) {
      const p = windSoundParams(bad);
      expect(p.gain).toBeGreaterThanOrEqual(0);
      expect(p.gain).toBeLessThanOrEqual(CONFIG.audio.maxGain);
      expect(Number.isFinite(p.cutoff)).toBe(true);
      expect(Number.isFinite(p.lfoRate)).toBe(true);
    }
  });
});
