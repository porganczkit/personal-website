import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../lib/freedom-pit/config';
import { createGame } from '../../lib/freedom-pit/sim';
import { isGusting, updateWind } from '../../lib/freedom-pit/wind';

describe('wind', () => {
  it('stays inside [0, 1] over a long game', () => {
    const s = createGame(7);
    let max = 0;
    for (let i = 0; i < 60 * 600; i++) {
      s.time += 1 / 60;
      updateWind(s, 1 / 60);
      expect(s.wind.force).toBeGreaterThanOrEqual(0);
      expect(s.wind.force).toBeLessThanOrEqual(1);
      max = Math.max(max, s.wind.force);
    }
    // It should actually get windy at some point, not sit flat.
    expect(max).toBeGreaterThan(0.5);
  });

  it('mean-reverts toward the calm baseline rather than drifting away', () => {
    const s = createGame(3);
    let sum = 0;
    let n = 0;
    for (let i = 0; i < 60 * 600; i++) {
      s.time += 1 / 60;
      updateWind(s, 1 / 60);
      if (!isGusting(s)) {
        sum += s.wind.force;
        n += 1;
      }
    }
    const mean = sum / n;
    expect(mean).toBeGreaterThan(CONFIG.wind.baseTarget * 0.4);
    expect(mean).toBeLessThan(CONFIG.wind.baseTarget * 2.5);
  });

  it('gusts, and a gust raises the target it is pulling toward', () => {
    const s = createGame(11);
    let sawGust = false;
    for (let i = 0; i < 60 * 300; i++) {
      s.time += 1 / 60;
      updateWind(s, 1 / 60);
      if (isGusting(s)) {
        sawGust = true;
        expect(s.wind.target).toBe(CONFIG.wind.gustTarget);
      }
    }
    expect(sawGust).toBe(true);
  });
});
