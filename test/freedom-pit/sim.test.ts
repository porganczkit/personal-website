import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../lib/freedom-pit/config';
import { deposit, totalFill } from '../../lib/freedom-pit/pit';
import { createGame, freedomProgress, step } from '../../lib/freedom-pit/sim';
import type { GameState, InputState } from '../../lib/freedom-pit/types';

const DT = 1 / 60;

/** A deterministic, seed-independent input tape — the same tape for every run. */
function tapeAt(frame: number): InputState {
  const h = Math.imul(frame ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return {
    up: (h & 1) !== 0,
    down: (h & 2) !== 0,
    left: (h & 4) !== 0,
    right: (h & 8) !== 0,
    action: (h & 16) !== 0,
    attack: (h & 32) !== 0,
    bribe: (h & 64) !== 0,
  };
}

/** Everything that could drift if the sim ever reached for a real clock or Math.random. */
function fingerprint(s: GameState): string {
  return JSON.stringify([
    s.time.toFixed(6),
    s.phase,
    s.quota,
    s.delivered.toFixed(6),
    s.lostToWind.toFixed(6),
    s.coins.toFixed(6),
    s.wind.force.toFixed(9),
    s.player.x.toFixed(6),
    s.player.y.toFixed(6),
    s.player.health,
    s.player.load.toFixed(6),
    s.scorpions.map((x) => `${x.id}:${x.x.toFixed(3)}:${x.y.toFixed(3)}`),
    s.mounds.map((m) => `${m.id}:${m.volume.toFixed(3)}`),
    s.pit.map((f) => f.toFixed(6)),
    s.stats,
  ]);
}

/**
 * Random inputs get you stung to death in about 20 seconds, which would leave
 * the replay check covering almost nothing — so this walker is unkillable, and
 * the tape drives every other system for the full 20k frames.
 */
function play(seed: number, frames: number): GameState {
  const s = createGame(seed);
  s.player.health = Number.MAX_SAFE_INTEGER;
  for (let f = 0; f < frames; f++) step(s, tapeAt(f), DT);
  return s;
}

describe('game outcome', () => {
  it('grants freedom once the pit holds the quota', () => {
    const s = createGame(1);
    deposit(s, 30, s.quota);

    step(s, tapeAt(0), DT);

    expect(s.phase).toBe('won');
    expect(freedomProgress(s)).toBe(1);
  });

  it('is lost when the last heart goes', () => {
    const s = createGame(1);
    s.player.health = 0;

    step(s, tapeAt(0), DT);

    expect(s.phase).toBe('lost');
  });

  it('freezes completely once the game is over', () => {
    const s = createGame(1);
    deposit(s, 30, s.quota);
    step(s, tapeAt(0), DT);
    const after = fingerprint(s);

    for (let f = 0; f < 600; f++) step(s, tapeAt(f), DT);

    expect(fingerprint(s)).toBe(after);
  });

  it('promotes you to the truck partway to the quota, once', () => {
    const s = createGame(1);
    deposit(s, 30, s.quota * CONFIG.truck.unlockAt);

    step(s, tapeAt(0), DT);

    expect(s.promoted).toBe(true);
    expect(s.player.mode).toBe('truck');
    expect(s.phase).toBe('playing');
  });

  it('lets a foreman push the finish line away from you, without un-winning a win', () => {
    const s = createGame(1);
    deposit(s, 30, s.quota);
    step(s, tapeAt(0), DT);
    expect(s.phase).toBe('won');

    s.quota += CONFIG.quota.bossPenalty;

    step(s, tapeAt(1), DT);
    expect(s.phase).toBe('won'); // a raised quota cannot retroactively cancel freedom
  });

  it('measures the quota against sand in the pit, not sand ever shovelled', () => {
    // This is what makes the wind matter at all: cumulative delivery is not progress.
    const s = createGame(1);
    deposit(s, 30, s.quota);
    s.pit.fill(0);
    s.shelter.fill(0);

    step(s, tapeAt(0), DT);

    expect(s.delivered).toBeGreaterThanOrEqual(s.quota);
    expect(totalFill(s)).toBe(0);
    expect(s.phase).toBe('playing');
  });
});

describe('determinism', () => {
  it('replays identically from the same seed and inputs', () => {
    const a = play(42, 20_000);
    const b = play(42, 20_000);
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('produces a different game from a different seed', () => {
    const a = play(42, 20_000);
    const c = play(43, 20_000);
    expect(fingerprint(a)).not.toBe(fingerprint(c));
  });

  it('advances real state over those 20k frames, so the check is not vacuous', () => {
    const a = play(42, 20_000);
    expect(a.time).toBeCloseTo(20_000 * DT, 3);
    expect(a.nextId).toBeGreaterThan(8);
  });
});
