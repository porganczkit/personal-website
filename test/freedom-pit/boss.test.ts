import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../lib/freedom-pit/config';
import { updateBoss } from '../../lib/freedom-pit/entities';
import { createGame } from '../../lib/freedom-pit/sim';
import type { Boss, GameState, InputState } from '../../lib/freedom-pit/types';

const NONE: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  action: false,
  attack: false,
  bribe: false,
};
const BRIBE: InputState = { ...NONE, bribe: true };

function confronting(s: GameState, decision: number = CONFIG.boss.decisionTime): Boss {
  const boss: Boss = {
    id: 1,
    x: s.player.x,
    y: s.player.y,
    state: 'confronting',
    pursuit: 0,
    decision,
  };
  s.boss = boss;
  return boss;
}

describe('the foreman', () => {
  it('raises the quota by exactly the penalty when you do not pay', () => {
    const s = createGame(1);
    const before = s.quota;
    confronting(s, 0.05);

    updateBoss(s, NONE, 0.1);

    expect(s.quota).toBe(before + CONFIG.quota.bossPenalty);
    expect(s.stats.quotaAdded).toBe(CONFIG.quota.bossPenalty);
    expect(s.boss?.state).toBe('leaving');
  });

  it('takes the bribe, leaves the quota alone, and costs you the coins', () => {
    const s = createGame(1);
    s.coins = 500;
    const before = s.quota;
    confronting(s);

    updateBoss(s, BRIBE, 1 / 60);

    expect(s.quota).toBe(before);
    expect(s.coins).toBe(500 - CONFIG.boss.bribeCost);
    expect(s.stats.bribesPaid).toBe(1);
    expect(s.boss?.state).toBe('leaving');
  });

  it('cannot be bribed with coins you do not have', () => {
    const s = createGame(1);
    s.coins = CONFIG.boss.bribeCost - 1;
    const before = s.quota;
    confronting(s, 0.05);

    updateBoss(s, BRIBE, 0.1);

    expect(s.coins).toBe(CONFIG.boss.bribeCost - 1); // never goes negative
    expect(s.quota).toBe(before + CONFIG.quota.bossPenalty);
  });

  it('charges only once, however long you hold the bribe key', () => {
    const s = createGame(1);
    s.coins = 500;
    confronting(s);

    for (let i = 0; i < 60; i++) updateBoss(s, BRIBE, 1 / 60);

    expect(s.stats.bribesPaid).toBe(1);
    expect(s.coins).toBe(500 - CONFIG.boss.bribeCost);
  });

  it('speeds up the longer you keep away from him', () => {
    const s = createGame(1);
    s.player.x = 3000;
    s.boss = { id: 1, x: 2000, y: s.player.y, state: 'approaching', pursuit: 0, decision: 0 };

    const first = s.boss.x;
    updateBoss(s, NONE, 0.5);
    const earlyStep = s.boss!.x - first;

    s.boss!.pursuit = 12;
    const second = s.boss!.x;
    updateBoss(s, NONE, 0.5);
    const lateStep = s.boss!.x - second;

    expect(lateStep).toBeGreaterThan(earlyStep);
  });

  it('eventually leaves and schedules the next visit', () => {
    const s = createGame(1);
    confronting(s, 0.05);
    updateBoss(s, NONE, 0.1); // takes the penalty, starts leaving

    for (let i = 0; i < 300; i++) updateBoss(s, NONE, 1 / 60);

    expect(s.boss).toBeNull();
    expect(s.nextBossAt).toBeGreaterThan(s.time);
  });
});
