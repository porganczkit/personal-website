import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../lib/freedom-pit/config';
import { deposit, erode, segmentAtX, totalFill } from '../../lib/freedom-pit/pit';
import { createGame } from '../../lib/freedom-pit/sim';

const CAP = CONFIG.pit.capacity;

describe('pit', () => {
  it('never lets a segment exceed capacity, and spills the rest to neighbours', () => {
    const s = createGame(1);
    const accepted = deposit(s, 10, CAP * 3);

    expect(accepted).toBeCloseTo(CAP * 3, 9);
    expect(totalFill(s)).toBeCloseTo(CAP * 3, 9);
    for (const fill of s.pit) expect(fill).toBeLessThanOrEqual(CAP + 1e-9);
    expect(s.pit[10]).toBeCloseTo(CAP, 9);
    // Spill goes to the nearest neighbours, not somewhere arbitrary.
    expect(s.pit[9] + s.pit[11]).toBeCloseTo(CAP * 2, 9);
  });

  it('conserves volume and pays coins only on sand that actually landed', () => {
    const s = createGame(1);
    s.pit.fill(CAP); // pit completely full
    const before = { delivered: s.delivered, coins: s.coins };

    const accepted = deposit(s, 30, 4);

    expect(accepted).toBe(0);
    expect(totalFill(s)).toBeCloseTo(CAP * CONFIG.world.segments, 6);
    expect(s.delivered).toBe(before.delivered);
    expect(s.coins).toBe(before.coins);
  });

  it('pays coins in proportion to what was delivered', () => {
    const s = createGame(1);
    deposit(s, 5, 2);
    expect(s.delivered).toBeCloseTo(2, 9);
    expect(s.coins).toBeCloseTo(2 * CONFIG.economy.coinsPerCubicMetre, 9);
  });

  it('erosion never drives a segment below zero, however long the wind blows', () => {
    const s = createGame(1);
    deposit(s, 20, 10);
    s.shelter.fill(0);
    s.wind.force = 1;

    // Track the worst value seen rather than asserting inside the loop — 1.2M
    // expect() calls is slower than the simulation itself.
    let worst = Infinity;
    for (let i = 0; i < 20000; i++) {
      erode(s, 1 / 60);
      for (const fill of s.pit) if (fill < worst) worst = fill;
    }

    expect(worst).toBeGreaterThanOrEqual(0);
    expect(totalFill(s)).toBeGreaterThanOrEqual(0);
    // Erosion is proportional to fill, so it decays exponentially rather than
    // hitting a floor — an unattended pit loses the bulk of what is in it.
    expect(totalFill(s)).toBeLessThan(10 * 0.25);
  });

  it('accounts for every m³ the wind takes', () => {
    const s = createGame(1);
    deposit(s, 20, 10);
    s.shelter.fill(0);
    s.wind.force = 1;
    const before = totalFill(s);

    let reported = 0;
    for (let i = 0; i < 600; i++) reported += erode(s, 1 / 60);

    expect(reported).toBeGreaterThan(0);
    expect(before - totalFill(s)).toBeCloseTo(reported, 6);
    expect(s.lostToWind).toBeCloseTo(reported, 6);
  });

  it('shelters a segment you just topped up, so filling never feels futile', () => {
    const s = createGame(1);
    deposit(s, 20, 3); // deposit sets the shelter timer
    s.wind.force = 1;
    const before = s.pit[20];

    erode(s, 1 / 60);

    expect(s.pit[20]).toBe(before);
    expect(s.shelter[20]).toBeLessThan(CONFIG.pit.shelterTime);
  });

  it('clamps segment lookup to the ends of the pit', () => {
    expect(segmentAtX(-500)).toBe(0);
    expect(segmentAtX(1e9)).toBe(CONFIG.world.segments - 1);
  });
});
