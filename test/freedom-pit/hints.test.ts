import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../lib/freedom-pit/config';
import { newScorpion, trySwing } from '../../lib/freedom-pit/entities';
import { actionHint, scorpionInRange } from '../../lib/freedom-pit/hints';
import { createGame } from '../../lib/freedom-pit/sim';
import type { GameState } from '../../lib/freedom-pit/types';

function atMound(): GameState {
  const s = createGame(1);
  s.mounds = [{ id: 99, x: 2000, y: 150, volume: 10 }];
  s.player.x = 2000;
  s.player.y = 150;
  return s;
}

describe('action hints', () => {
  it('tells you to dig when you are close enough to actually dig', () => {
    const s = atMound();
    expect(actionHint(s)).toBe('Hold SPACE to dig');
  });

  it('tells you to go find sand when nothing is in reach', () => {
    const s = atMound();
    s.player.x = 500; // miles from the mound
    expect(actionHint(s)).toBe('Find a sand mound');
  });

  it('never claims you can dig from somewhere you cannot', () => {
    // The hint and the dig must agree, or it is worse than no hint at all.
    const s = atMound();
    const justOutOfReach = CONFIG.player.reach + CONFIG.mounds.radius + 5;
    s.player.x = 2000 + justOutOfReach;
    expect(actionHint(s)).toBe('Find a sand mound');
  });

  it('switches to dumping once you are carrying something', () => {
    const s = atMound();
    s.player.load = CONFIG.player.shovelLoad;
    expect(actionHint(s)).toBe('Carry it to the pit edge');

    s.player.y = CONFIG.world.pitTop - 20;
    expect(actionHint(s)).toBe('Press SPACE to dump');
  });

  it('talks about hoppers once you are driving', () => {
    const s = atMound();
    s.player.mode = 'truck';
    s.player.x = s.loaders[0].x;
    s.player.y = s.loaders[0].y;
    expect(actionHint(s)).toBe('Hold SPACE to load');
  });

  it('says nothing while stunned or after the game is over', () => {
    const s = atMound();
    s.player.stun = 1;
    expect(actionHint(s)).toBeNull();

    s.player.stun = 0;
    s.phase = 'lost';
    expect(actionHint(s)).toBeNull();
  });

  it('flags a scorpion only when a swing could actually reach it', () => {
    const s = atMound();
    expect(scorpionInRange(s)).toBe(false);

    s.scorpions = [newScorpion(1, s.player.x + 30, s.player.y)];
    expect(scorpionInRange(s)).toBe(true);

    s.scorpions = [newScorpion(1, s.player.x + 500, s.player.y)];
    expect(scorpionInRange(s)).toBe(false);
  });
});

describe('swing aiming', () => {
  it('turns to face a scorpion behind you rather than swinging at nothing', () => {
    const s = atMound();
    s.player.dirX = 1; // last walked right
    s.player.dirY = 0;
    s.scorpions = [newScorpion(1, s.player.x - 30, s.player.y)]; // it is on your left

    trySwing(s);

    expect(s.player.dirX).toBeCloseTo(-1, 6);
  });

  it('leaves your facing alone when there is nothing in reach', () => {
    const s = atMound();
    s.player.dirX = 1;
    s.player.dirY = 0;
    s.scorpions = [newScorpion(1, s.player.x + 400, s.player.y)];

    trySwing(s);

    expect(s.player.dirX).toBe(1);
  });
});
