import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../lib/freedom-pit/config';
import { newScorpion, trySwing, updatePlayer } from '../../lib/freedom-pit/entities';
import { totalFill } from '../../lib/freedom-pit/pit';
import { createGame, step } from '../../lib/freedom-pit/sim';
import type { GameState, InputState } from '../../lib/freedom-pit/types';

const DT = 1 / 60;

function input(over: Partial<InputState> = {}): InputState {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    action: false,
    attack: false,
    bribe: false,
    ...over,
  };
}

/** Park the worker on a lone mound, well back from the pit edge. */
function atMound(seed = 1): GameState {
  const s = createGame(seed);
  s.player.x = 2000;
  s.player.y = 100;
  s.mounds = [{ id: 99, x: 2000, y: 100, volume: 10 }];
  return s;
}

function hold(s: GameState, over: Partial<InputState>, frames: number): void {
  const i = input(over);
  for (let f = 0; f < frames; f++) step(s, i, DT);
}

/**
 * Let a started swing run its wind-up and connect. Ticks the player only, so
 * the scorpions under test stay exactly where they were put.
 */
function land(s: GameState): void {
  const i = input();
  const frames = Math.ceil(CONFIG.player.swingWindup / DT) + 1;
  for (let f = 0; f < frames; f++) updatePlayer(s, i, DT);
}

describe('shovel work', () => {
  it('fills the shovel with exactly one load after the dig time', () => {
    const s = atMound();

    hold(s, { action: true }, Math.ceil(CONFIG.player.digTime / DT) + 1);

    expect(s.player.load).toBeCloseTo(CONFIG.player.shovelLoad, 9);
    expect(s.mounds[0].volume).toBeCloseTo(10 - CONFIG.player.shovelLoad, 9);
  });

  it('does not fill the shovel before the dig time is up', () => {
    const s = atMound();
    hold(s, { action: true }, Math.floor(CONFIG.player.digTime / DT) - 3);
    expect(s.player.load).toBe(0);
  });

  it('moves the load from shovel to pit, and nowhere else', () => {
    const s = atMound();
    s.player.load = CONFIG.player.shovelLoad;
    s.player.y = CONFIG.world.pitTop - 20; // at the lip

    step(s, input({ action: true }), DT);

    expect(s.player.load).toBe(0);
    expect(totalFill(s)).toBeCloseTo(CONFIG.player.shovelLoad, 9);
    expect(s.delivered).toBeCloseTo(CONFIG.player.shovelLoad, 9);
  });

  it('dumping empty-handed is a no-op', () => {
    const s = atMound();
    s.player.y = CONFIG.world.pitTop - 20;

    hold(s, { action: true }, 30);

    expect(totalFill(s)).toBe(0);
    expect(s.delivered).toBe(0);
  });

  it('replaces a mound that has been dug out', () => {
    const s = atMound();
    s.mounds[0].volume = CONFIG.player.shovelLoad;

    hold(s, { action: true }, Math.ceil(CONFIG.player.digTime / DT) + 1);

    expect(s.mounds).toHaveLength(1);
    expect(s.mounds[0].id).not.toBe(99);
    expect(s.mounds[0].volume).toBe(CONFIG.mounds.volume);
  });

  it('cannot work while stunned', () => {
    const s = atMound();
    s.player.stun = 1;

    hold(s, { action: true }, 30);

    expect(s.player.load).toBe(0);
    expect(s.player.digProgress).toBe(0);
  });
});

describe('the swing', () => {
  it('kills a scorpion in front of you and pays the bounty', () => {
    const s = atMound();
    s.player.dirX = 1;
    s.player.dirY = 0;
    s.scorpions = [newScorpion(1, s.player.x + 30, s.player.y)];

    trySwing(s);
    land(s);

    expect(s.scorpions).toHaveLength(0);
    expect(s.coins).toBe(CONFIG.scorpion.bounty);
    expect(s.stats.scorpionsKilled).toBe(1);
  });

  it('misses a scorpion behind you', () => {
    const s = atMound();
    s.player.dirX = 1;
    s.player.dirY = 0;
    s.scorpions = [newScorpion(1, s.player.x - 30, s.player.y)];

    trySwing(s);
    land(s);

    expect(s.scorpions).toHaveLength(1);
    expect(s.coins).toBe(0);
  });

  it('misses a scorpion out of range', () => {
    const s = atMound();
    s.player.dirX = 1;
    s.player.dirY = 0;
    const far = CONFIG.player.swingRange + CONFIG.scorpion.radius + 5;
    s.scorpions = [newScorpion(1, s.player.x + far, s.player.y)];

    trySwing(s);
    land(s);

    expect(s.scorpions).toHaveLength(1);
  });

  it('cannot swing again until the cooldown has run', () => {
    const s = atMound();
    s.player.dirX = 1;
    s.player.dirY = 0;
    s.scorpions = [newScorpion(1, s.player.x + 30, s.player.y)];
    trySwing(s); // consumes the swing and the scorpion
    land(s);

    s.scorpions = [newScorpion(2, s.player.x + 30, s.player.y)];
    trySwing(s);
    land(s);

    expect(s.scorpions).toHaveLength(1);
  });

  it('takes a wind-up to connect, so it is not a free press', () => {
    const s = atMound();
    s.player.dirX = 1;
    s.player.dirY = 0;
    s.scorpions = [newScorpion(1, s.player.x + 30, s.player.y)];

    trySwing(s);
    updatePlayer(s, input(), DT); // one frame in, mid-wind-up

    expect(s.scorpions).toHaveLength(1);
    expect(s.player.swingWindup).toBeGreaterThan(0);
  });

  it('is cancelled by a sting landing mid-wind-up', () => {
    const s = atMound();
    s.player.dirX = 1;
    s.player.dirY = 0;
    s.scorpions = [newScorpion(1, s.player.x + 30, s.player.y)];

    trySwing(s);
    s.player.stun = CONFIG.player.stunTime; // stung before the shovel lands
    land(s);

    expect(s.scorpions).toHaveLength(1);
  });

  it('only swings once per key press, not once per frame', () => {
    const s = atMound();

    // Held for longer than a cooldown: if the key re-armed every frame the
    // cooldown could never expire.
    hold(s, { attack: true }, Math.ceil(CONFIG.player.swingCooldown / DT) + 5);

    expect(s.player.swingCooldown).toBe(0);
  });
});

describe('scorpion bites', () => {
  it('costs a heart, drops the load and stuns', () => {
    const s = atMound();
    s.player.load = CONFIG.player.shovelLoad;
    s.scorpions = [newScorpion(1, s.player.x, s.player.y)];

    step(s, input(), DT);

    expect(s.player.health).toBe(CONFIG.player.maxHealth - 1);
    expect(s.player.load).toBe(0);
    expect(s.player.stun).toBeGreaterThan(0);
    expect(s.stats.bitesTaken).toBe(1);
  });

  it('grants brief invulnerability so one scorpion cannot chew through you', () => {
    const s = atMound();
    s.scorpions = [newScorpion(1, s.player.x, s.player.y)];

    hold(s, {}, 30); // half a second of contact

    expect(s.player.health).toBe(CONFIG.player.maxHealth - 1);
    expect(s.stats.bitesTaken).toBe(1);
  });
});
